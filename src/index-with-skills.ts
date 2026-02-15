import { ChatOpenAI } from "@langchain/openai";
import * as path from "path";
import * as url from "url";
import * as dotenv from "dotenv";
import { StateGraph, Annotation, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { FilesystemBackend } from "deepagents";
import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { randomUUID } from "crypto";

// Load environment variables
dotenv.config();

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// State definition
const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
  }),
});

/**
 * Routing function: Determines the next node
 */
function shouldContinue(state: typeof StateAnnotation.State): "tools" | "end" {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1] as AIMessage;

  // Check if there are tool calls
  if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
    return "tools";
  }

  return "end";
}

/**
 * Manually load skills metadata from FilesystemBackend
 */
async function loadSkillsMetadata(backend: FilesystemBackend, skillsPath: string) {
  const skills = [];

  // Enumerate subdirectories in the skills directory
  const skillDirs = await backend.lsInfo(skillsPath);

  for (const dir of skillDirs) {
    if (dir.is_dir) {
      // When virtualMode=true, paths start with /, so concatenate as-is
      const skillMdPath = `${dir.path}SKILL.md`;

      try {
        // Read SKILL.md (use readRaw to get raw content)
        const fileData = await backend.readRaw(skillMdPath);
        const content = fileData.content.join('\n');

        // Parse YAML frontmatter
        const frontmatterMatch = content.match(/^---\n([\s\S]+?)\n---/);

        if (frontmatterMatch) {
          const frontmatter = frontmatterMatch[1];
          const nameMatch = frontmatter.match(/name:\s*(.+)/);
          const descMatch = frontmatter.match(/description:\s*(.+)/);

          if (nameMatch && descMatch) {
            // Get the body after frontmatter
            const instructions = content.replace(/^---\n[\s\S]+?\n---\n/, '');

            skills.push({
              name: nameMatch[1].trim(),
              description: descMatch[1].trim(),
              path: skillMdPath,
              instructions: instructions.trim(),
            });
          }
        }
      } catch (error) {
        // Skip if skill file is not found
        console.warn(`Warning: Could not load skill from ${skillMdPath}`);
      }
    }
  }

  return skills;
}

/**
 * Main function to demonstrate LangGraph with explicit nodes, edges, and FilesystemBackend skills
 */
async function main() {
  console.log("🚀 LangGraph.JS with Explicit Nodes/Edges + FilesystemBackend Skills\n");

  // Initialize the model
  const model = new ChatOpenAI({
    model: "gpt-4o",
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Set up FilesystemBackend
  const backend = new FilesystemBackend({
    rootDir: path.join(__dirname, ".."),
    virtualMode: true,
  });

  console.log("📁 Loading skills from FilesystemBackend...\n");

  // Load skills metadata
  const skillsPath = "/skills";
  const skills = await loadSkillsMetadata(backend, skillsPath);

  console.log(`✅ Loaded ${skills.length} skills:`);
  skills.forEach(skill => {
    console.log(`   - ${skill.name}: ${skill.description}`);
  });
  console.log();

  // FilesystemBackendのツールを作成（read, write, edit, lsInfoなど）
  const readFileTool = new DynamicStructuredTool({
    name: "read_file",
    description: "Read a file from the filesystem. Use this to read SKILL.md files for detailed instructions.",
    schema: z.object({
      filePath: z.string().describe("The path to the file to read"),
    }),
    func: async ({ filePath }) => {
      try {
        return await backend.read(filePath);
      } catch (error: any) {
        return `Error reading file: ${error.message}`;
      }
    },
  });

  const executeCommandTool = new DynamicStructuredTool({
    name: "execute",
    description: "Execute a shell command. Use this to run scripts mentioned in SKILL.md files.",
    schema: z.object({
      command: z.string().describe("The command to execute"),
    }),
    func: async ({ command }) => {
      // Simple command execution (more secure implementation needed in production)
      const { execSync } = await import('child_process');
      try {
        // When virtualMode=true, convert /skills/ to actual path
        const adjustedCommand = command.replace(/\/skills\//g, path.join(__dirname, "..", "skills") + path.sep);

        const result = execSync(adjustedCommand, {
          cwd: path.join(__dirname, ".."),
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
        });
        return result;
      } catch (error: any) {
        return `Error executing command: ${error.message}\nStderr: ${error.stderr || 'N/A'}`;
      }
    },
  });

  const fetchUrlTool = new DynamicStructuredTool({
    name: "fetch_url",
    description: "Fetches content from a URL and returns it as text. Use this to retrieve documentation or web content. Large responses are automatically truncated to prevent context overflow.",
    schema: z.object({
      url: z.string().describe("The URL to fetch"),
      maxLength: z.number().optional().describe("Maximum character length of the response (default: 50000)"),
    }),
    func: async ({ url, maxLength = 50000 }) => {
      try {
        const response = await fetch(url);

        if (!response.ok) {
          return `Error fetching URL: HTTP ${response.status} ${response.statusText}`;
        }

        const text = await response.text();

        // Limit response size to prevent context overflow
        if (text.length > maxLength) {
          return `${text.substring(0, maxLength)}\n\n[... Content truncated. Original length: ${text.length} characters, showing first ${maxLength} characters ...]`;
        }

        return text;
      } catch (error: any) {
        return `Error fetching URL: ${error.message}`;
      }
    },
  });

  const tools = [readFileTool, executeCommandTool, fetchUrlTool];

  // Bind tools to the model
  const modelWithTools = model.bindTools(tools);

  // Create ToolNode
  const toolNode = new ToolNode(tools);

  // Build the graph
  console.log("🔧 Building StateGraph with nodes and edges...\n");

  const workflow = new StateGraph(StateAnnotation)
    // Add nodes
    .addNode("agent", async (state) => {
      const messages = state.messages;

      // Add skills information as system message on first turn only
      if (messages.length === 1) {
        const skillsPrompt = `You have access to the following skills:

${skills.map(s =>
  `**${s.name}**: ${s.description}
   - Full instructions: Read ${s.path} using the read_file tool`
).join('\n\n')}

When a user asks you to use a skill:
1. Use the read_file tool to read the SKILL.md file
2. Follow the instructions in the SKILL.md file
3. Use the execute tool if the instructions require running a command`;

        const systemMessage = new SystemMessage(skillsPrompt);
        const messagesWithSkills = [systemMessage, ...messages];
        const response = await modelWithTools.invoke(messagesWithSkills);
        return { messages: [response] };
      }

      const response = await modelWithTools.invoke(messages);
      return { messages: [response] };
    })
    .addNode("tools", toolNode)

    // Add edges
    .addEdge("__start__", "agent")
    .addConditionalEdges(
      "agent",
      shouldContinue,
      {
        tools: "tools",
        end: END,
      }
    )
    .addEdge("tools", "agent");

  // Add memory saver
  const checkpointer = new MemorySaver();
  const app = workflow.compile({ checkpointer });

  console.log("✅ Graph compiled successfully!\n");
  console.log("📊 Graph structure:");
  console.log("   Nodes: agent (with skills context), tools (with FilesystemBackend)");
  console.log("   Edges:");
  console.log("     - START → agent");
  console.log("     - agent → tools (if tool calls exist)");
  console.log("     - agent → END (if no tool calls)");
  console.log("     - tools → agent (loop back)");
  console.log("\n" + "=".repeat(60) + "\n");

  // Example 1: Test arxiv-search skill
  console.log("📚 Example 1: Testing arXiv search skill with explicit graph");
  console.log("-".repeat(60));

  const arxivQuery = "Search arXiv for papers about 'transformers in natural language processing' and show me the top 3 results. Use the arxiv-search skill.";
  console.log(`Query: ${arxivQuery}\n`);

  // Generate unique thread_id for this query
  const arxivThreadId = randomUUID();
  console.log(`Thread ID: ${arxivThreadId}\n`);

  const arxivResult = await app.invoke(
    { messages: [new HumanMessage(arxivQuery)] },
    { configurable: { thread_id: arxivThreadId } }
  );

  // Get the last message from the agent
  const arxivMessages = arxivResult.messages;
  if (arxivMessages && arxivMessages.length > 0) {
    const lastMessage = arxivMessages[arxivMessages.length - 1];
    console.log(`\nAgent Response:\n${lastMessage.content}\n`);
  }

  console.log("\n" + "=".repeat(60) + "\n");

  // Example 2: Test langgraph-docs skill
  console.log("📖 Example 2: Testing langgraph-docs skill");
  console.log("-".repeat(60));

  const docsQuery = "Can you explain how to create a basic agent using LangGraph? Use the langgraph-docs skill to get the latest documentation.";
  console.log(`Query: ${docsQuery}\n`);

  // Generate unique thread_id for this query
  const docsThreadId = randomUUID();
  console.log(`Thread ID: ${docsThreadId}\n`);

  const docsResult = await app.invoke(
    { messages: [new HumanMessage(docsQuery)] },
    { configurable: { thread_id: docsThreadId } }
  );

  const docsMessages = docsResult.messages;

  // Debug: Display all messages
  console.log("\n📋 All messages in conversation:");
  docsMessages.forEach((msg, idx) => {
    const msgType = msg.constructor.name;
    console.log(`\n[${idx}] ${msgType}:`);
    if (msg instanceof AIMessage && msg.tool_calls?.length) {
      console.log(`  Tool calls: ${JSON.stringify(msg.tool_calls, null, 2)}`);
    }
    if (msg.content) {
      const preview = String(msg.content).substring(0, 200);
      console.log(`  Content: ${preview}${String(msg.content).length > 200 ? '...' : ''}`);
    }
  });

  if (docsMessages && docsMessages.length > 0) {
    const lastMessage = docsMessages[docsMessages.length - 1];
    console.log(`\n\nAgent Response:\n${lastMessage.content}\n`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("\n✨ Skills-based graph test completed successfully!");
}

// Run the main function
main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
