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
import { readFileSync, writeFileSync, statSync } from "fs";
import { execSync } from "child_process";
import { glob } from "glob";

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
 * Main function with Claude Code-style tools + FilesystemBackend skills
 */
async function main() {
  console.log("🚀 LangGraph.JS with Claude Code Tools + FilesystemBackend Skills\n");

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

  // ========================================
  // Claude Code Built-in Tools
  // ========================================

  // 1. Read Tool
  const readTool = new DynamicStructuredTool({
    name: "read_file",
    description: "Reads file contents. Supports text, images, PDFs, and Jupyter Notebooks.",
    schema: z.object({
      file_path: z.string().describe("Absolute or relative path to the file to read"),
      offset: z.number().optional().describe("Line number to start reading from (optional)"),
      limit: z.number().optional().describe("Number of lines to read (optional). Default is 2000 lines"),
    }),
    func: async ({ file_path, offset, limit }) => {
      try {
        // Convert to absolute path if relative
        const absolutePath = path.isAbsolute(file_path)
          ? file_path
          : path.join(__dirname, "..", file_path);

        const content = readFileSync(absolutePath, "utf-8");
        const lines = content.split("\n");

        const startLine = offset || 0;
        const endLine = limit ? startLine + limit : Math.min(startLine + 2000, lines.length);

        return lines.slice(startLine, endLine)
          .map((line, idx) => `${startLine + idx + 1}→${line}`)
          .join("\n");
      } catch (error: any) {
        return `Error: ${error.message}`;
      }
    },
  });

  // 2. Write Tool
  const writeTool = new DynamicStructuredTool({
    name: "write_file",
    description: "Writes content to a file. Existing files will be overwritten. Minimize new file creation and prefer editing existing files.",
    schema: z.object({
      file_path: z.string().describe("Path to the file to write"),
      content: z.string().describe("Content to write"),
    }),
    func: async ({ file_path, content }) => {
      try {
        const absolutePath = path.isAbsolute(file_path)
          ? file_path
          : path.join(__dirname, "..", file_path);

        writeFileSync(absolutePath, content, "utf-8");
        return `File written: ${file_path}`;
      } catch (error: any) {
        return `Error: ${error.message}`;
      }
    },
  });

  // 3. Edit Tool
  const editTool = new DynamicStructuredTool({
    name: "edit_file",
    description: "Performs exact string replacements in files. old_string must exactly match actual file content excluding line number prefix.",
    schema: z.object({
      file_path: z.string().describe("Path to the file to edit"),
      old_string: z.string().describe("String to replace (exact match required)"),
      new_string: z.string().describe("New string (must differ from old_string)"),
      replace_all: z.boolean().optional().default(false).describe("Set to true to replace all occurrences"),
    }),
    func: async ({ file_path, old_string, new_string, replace_all }) => {
      try {
        if (old_string === new_string) {
          return "Error: old_string and new_string are the same";
        }

        const absolutePath = path.isAbsolute(file_path)
          ? file_path
          : path.join(__dirname, "..", file_path);

        let content = readFileSync(absolutePath, "utf-8");

        if (replace_all) {
          const escapedOldString = old_string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const count = (content.match(new RegExp(escapedOldString, 'g')) || []).length;
          content = content.replaceAll(old_string, new_string);
          writeFileSync(absolutePath, content, "utf-8");
          return `Replaced ${count} occurrence(s): ${file_path}`;
        } else {
          const occurrences = content.split(old_string).length - 1;
          if (occurrences === 0) {
            return `Error: old_string not found`;
          }
          if (occurrences > 1) {
            return `Error: old_string found in ${occurrences} places. Must be unique. Include more context or use replace_all=true.`;
          }
          content = content.replace(old_string, new_string);
          writeFileSync(absolutePath, content, "utf-8");
          return `File edited: ${file_path}`;
        }
      } catch (error: any) {
        return `Error: ${error.message}`;
      }
    },
  });

  // 4. Glob Tool
  const globTool = new DynamicStructuredTool({
    name: "glob_files",
    description: "Fast file pattern matching (e.g., **/*.ts, src/**/*.js). Results sorted by modification time.",
    schema: z.object({
      pattern: z.string().describe("Glob pattern (e.g., **/*.js, src/**/*.tsx)"),
      search_path: z.string().optional().describe("Directory to search. Defaults to current directory"),
    }),
    func: async ({ pattern, search_path }) => {
      try {
        const cwd = search_path
          ? (path.isAbsolute(search_path) ? search_path : path.join(__dirname, "..", search_path))
          : path.join(__dirname, "..");

        const files = await glob(pattern, {
          cwd: cwd,
          absolute: true,
          nodir: true,
        });

        // Sort by modification time
        const filesWithStats = files.map(f => ({
          path: f,
          mtime: statSync(f).mtime,
        }));
        filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

        return filesWithStats.length > 0
          ? filesWithStats.map(f => f.path).join("\n")
          : "No matching files found";
      } catch (error: any) {
        return `Error: ${error.message}`;
      }
    },
  });

  // 5. Grep Tool (simplified - using grep command)
  const grepTool = new DynamicStructuredTool({
    name: "grep_search",
    description: "Searches file contents. Supports regex and can filter by file type or glob pattern.",
    schema: z.object({
      pattern: z.string().describe("Regex pattern to search for"),
      search_path: z.string().optional().describe("File or directory to search. Defaults to current directory"),
      glob_pattern: z.string().optional().describe("File filter (e.g., *.js, **/*.tsx)"),
      case_insensitive: z.boolean().optional().describe("Case insensitive search"),
    }),
    func: async ({ pattern, search_path, glob_pattern, case_insensitive }) => {
      try {
        const cwd = path.join(__dirname, "..");
        let cmd = `grep -r "${pattern.replace(/"/g, '\\"')}"`;

        if (case_insensitive) cmd += ` -i`;
        if (search_path) cmd += ` "${search_path}"`;
        else cmd += ` .`;

        if (glob_pattern) {
          cmd += ` --include="${glob_pattern}"`;
        }

        const result = execSync(cmd, {
          cwd: cwd,
          encoding: "utf-8",
          maxBuffer: 10 * 1024 * 1024,
        });

        return result || "No matches";
      } catch (error: any) {
        // grep returns exit code 1 when no results found
        if (error.status === 1) {
          return "No matches";
        }
        return `Error: ${error.message}`;
      }
    },
  });

  // 6. Bash Tool
  const bashTool = new DynamicStructuredTool({
    name: "bash_command",
    description: "Executes bash commands. Use for git, npm, docker, etc. For file operations, use dedicated tools (Read, Write, Edit, Glob, Grep).",
    schema: z.object({
      command: z.string().describe("Bash command to execute. Quote paths with spaces"),
      description: z.string().optional().describe("Brief description of command (5-10 words). More detail for complex commands"),
      timeout: z.number().optional().default(120000).describe("Timeout in milliseconds. Maximum 600000 (10 minutes)"),
    }),
    func: async ({ command, description, timeout }) => {
      try {
        const result = execSync(command, {
          cwd: path.join(__dirname, ".."),
          encoding: "utf-8",
          timeout: timeout || 120000,
          maxBuffer: 30000 * 100,
          shell: "/bin/bash",
        });

        return result || "Command completed successfully (no output)";
      } catch (error: any) {
        const exitCode = error.status || 'unknown';
        const stderr = error.stderr || '';
        const stdout = error.stdout || '';
        return `Error (exit code ${exitCode}):\nSTDERR: ${stderr}\nSTDOUT: ${stdout}`;
      }
    },
  });

  // 7. WebFetch Tool
  const webFetchTool = new DynamicStructuredTool({
    name: "web_fetch",
    description: "Fetches content from URLs. HTML is converted to markdown. Cannot be used with authenticated URLs (Google Docs, GitHub, Jira, etc.).",
    schema: z.object({
      url: z.string().describe("URL to fetch (fully qualified). HTTP is automatically upgraded to HTTPS"),
      maxLength: z.number().optional().default(50000).describe("Maximum character count (default: 50000)"),
    }),
    func: async ({ url, maxLength = 50000 }) => {
      try {
        // Upgrade HTTP to HTTPS
        const fetchUrl = url.replace(/^http:/, 'https:');

        const response = await fetch(fetchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; LangGraphBot/1.0)',
          },
        });

        if (!response.ok) {
          return `Error: HTTP ${response.status} ${response.statusText}`;
        }

        const text = await response.text();

        // Truncate if too large
        if (text.length > maxLength) {
          return `${text.substring(0, maxLength)}\n\n[... Content truncated. Original length: ${text.length} characters, showing first ${maxLength} characters ...]`;
        }

        return text;
      } catch (error: any) {
        return `Error: ${error.message}`;
      }
    },
  });

  // Array of tools
  const tools = [
    readTool,
    writeTool,
    editTool,
    globTool,
    grepTool,
    bashTool,
    webFetchTool,
  ];

  console.log("🔧 Loaded Claude Code-style tools:");
  tools.forEach(tool => {
    console.log(`   - ${tool.name}`);
  });
  console.log();

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

      // Add skills information and tool usage guide as system message on first turn only
      if (messages.length === 1) {
        const skillsPrompt = `You have access to the following skills:

${skills.map(s => {
  // Convert virtual path /skills/ to actual path skills/
  const actualPath = s.path.replace(/^\/skills\//, 'skills/');
  return `**${s.name}**: ${s.description}
   - Full instructions: Read ${actualPath} using the read_file tool`;
}).join('\n\n')}

When a user asks you to use a skill:
1. Use the read_file tool to read the SKILL.md file (path starts with "skills/")
2. Follow the instructions in the SKILL.md file exactly
3. Use the bash_command tool if the instructions require running a command (npx tsx commands)
4. IMPORTANT: If SKILL.md mentions "fetch_url" or "execute", use the corresponding tool:
   - "fetch_url" → use "web_fetch" tool
   - "execute" → use "bash_command" tool

Available tools and their usage:
- **read_file**: Read files (prefer this over bash cat/head/tail)
- **write_file**: Create new files (prefer this over bash echo/redirection)
- **edit_file**: Edit existing files (prefer this over sed/awk)
- **glob_files**: Search for files by pattern (prefer this over find/ls)
- **grep_search**: Search file contents (prefer this over bash grep)
- **bash_command**: Execute shell commands (for git, npm, docker, etc.)
- **web_fetch**: Fetch content from URLs (also referred to as "fetch_url" in some skills)

Important principles:
1. Always prefer dedicated tools over bash commands for file operations
2. Keep solutions simple and focused
3. Only make changes that are directly requested`;

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
  console.log("   Nodes: agent (with skills + Claude Code tools), tools");
  console.log("   Edges:");
  console.log("     - START → agent");
  console.log("     - agent → tools (if tool calls exist)");
  console.log("     - agent → END (if no tool calls)");
  console.log("     - tools → agent (loop back)");
  console.log("\n" + "=".repeat(60) + "\n");

  // Example 1: Test arxiv-search skill
  console.log("📚 Example 1: Testing arXiv search skill with Claude Code tools");
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
  if (docsMessages && docsMessages.length > 0) {
    const lastMessage = docsMessages[docsMessages.length - 1];
    console.log(`\nAgent Response:\n${lastMessage.content}\n`);
  }

  console.log("\n" + "=".repeat(60) + "\n");

  // Example 3: Test file operations with Claude Code tools
  console.log("📁 Example 3: Testing Claude Code file tools");
  console.log("-".repeat(60));

  const fileOpsQuery = "Use glob_files to find all TypeScript files in the src directory, then use grep_search to find files containing 'StateGraph'.";
  console.log(`Query: ${fileOpsQuery}\n`);

  const fileOpsThreadId = randomUUID();
  console.log(`Thread ID: ${fileOpsThreadId}\n`);

  const fileOpsResult = await app.invoke(
    { messages: [new HumanMessage(fileOpsQuery)] },
    { configurable: { thread_id: fileOpsThreadId } }
  );

  const fileOpsMessages = fileOpsResult.messages;
  if (fileOpsMessages && fileOpsMessages.length > 0) {
    const lastMessage = fileOpsMessages[fileOpsMessages.length - 1];
    console.log(`\nAgent Response:\n${lastMessage.content}\n`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("\n✨ Claude Code tools + Skills test completed successfully!");
}

// Run the main function
main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
