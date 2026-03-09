/**
 * スキルクエリ動作確認
 * Getting Started / LangChain / LangGraph / Deep Agents カテゴリの確認
 */
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
import { readFileSync } from "fs";

dotenv.config();
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
  }),
});

function shouldContinue(state: typeof StateAnnotation.State): "tools" | "end" {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
    return "tools";
  }
  return "end";
}

async function loadSkillsMetadata(backend: FilesystemBackend, skillsPath: string) {
  const skills: { name: string; description: string; path: string }[] = [];

  async function scanDir(dirPath: string) {
    const entries = await backend.lsInfo(dirPath);
    for (const entry of entries) {
      if (entry.is_dir) {
        const skillMdPath = `${entry.path}SKILL.md`;
        try {
          const fileData = await backend.readRaw(skillMdPath);
          const content = fileData.content.join('\n');
          const frontmatterMatch = content.match(/^---\n([\s\S]+?)\n---/);
          if (frontmatterMatch) {
            const frontmatter = frontmatterMatch[1];
            const nameMatch = frontmatter.match(/name:\s*(.+)/);
            const descMatch = frontmatter.match(/description:\s*["']?([\s\S]+?)["']?$/m);
            if (nameMatch && descMatch) {
              skills.push({
                name: nameMatch[1].trim(),
                description: descMatch[1].trim().replace(/^["']|["']$/g, ''),
                path: skillMdPath,
              });
            }
          } else {
            await scanDir(entry.path);
          }
        } catch {
          await scanDir(entry.path);
        }
      }
    }
  }

  await scanDir(skillsPath);
  return skills;
}

interface QueryResult {
  label: string;
  query: string;
  response: string;
  toolsUsed: string[];
  success: boolean;
}

async function runQuery(app: any, query: string, label: string): Promise<QueryResult> {
  const threadId = randomUUID();
  console.log(`\n--- ${label} ---`);
  console.log(`Query: ${query}`);

  try {
    const result = await app.invoke(
      { messages: [new HumanMessage(query)] },
      { configurable: { thread_id: threadId } }
    );

    const messages = result.messages as BaseMessage[];
    const toolsUsed: string[] = [];

    for (const msg of messages) {
      if (msg instanceof AIMessage && msg.tool_calls?.length) {
        toolsUsed.push(...msg.tool_calls.map((tc: any) => tc.name));
      }
    }

    const lastMsg = messages[messages.length - 1];
    const response = String(lastMsg.content).substring(0, 500);
    console.log(`Response (first 500 chars): ${response}`);
    console.log(`Tools used: ${toolsUsed.join(', ') || 'none'}`);

    return { label, query, response, toolsUsed, success: true };
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    return { label, query, response: `ERROR: ${error.message}`, toolsUsed: [], success: false };
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("スキルクエリ動作確認");
  console.log("=".repeat(60));

  const model = new ChatOpenAI({
    model: "gpt-4o",
    apiKey: process.env.OPENAI_API_KEY,
  });

  const backend = new FilesystemBackend({
    rootDir: path.join(__dirname, ".."),
    virtualMode: true,
  });

  const skills = await loadSkillsMetadata(backend, "/skills");
  console.log(`\nLoaded ${skills.length} skills`);

  // read_file ツール（SKILL.md 読み込み用）
  const readTool = new DynamicStructuredTool({
    name: "read_file",
    description: "Read a file. Use this to read SKILL.md files for detailed instructions.",
    schema: z.object({
      file_path: z.string().describe("Path to the file to read"),
    }),
    func: async ({ file_path }) => {
      try {
        const absolutePath = path.isAbsolute(file_path)
          ? file_path
          : path.join(__dirname, "..", file_path);
        return readFileSync(absolutePath, "utf-8");
      } catch (error: any) {
        // Try via FilesystemBackend virtual path
        try {
          const fileData = await backend.readRaw(file_path);
          return fileData.content.join('\n');
        } catch {
          return `Error reading file: ${error.message}`;
        }
      }
    },
  });

  const tools = [readTool];
  const modelWithTools = model.bindTools(tools);
  const toolNode = new ToolNode(tools);

  const skillsPrompt = `You have access to the following skills. When asked to use a skill, read its SKILL.md file first using read_file tool, then follow the instructions.

${skills.map(s => `**${s.name}**: ${s.description}\n   - SKILL.md path: ${s.path}`).join('\n\n')}

Answer in Japanese when the user asks in Japanese.`;

  const workflow = new StateGraph(StateAnnotation)
    .addNode("agent", async (state) => {
      const msgs = state.messages;
      if (msgs.length === 1) {
        const response = await modelWithTools.invoke([new SystemMessage(skillsPrompt), ...msgs]);
        return { messages: [response] };
      }
      const response = await modelWithTools.invoke(msgs);
      return { messages: [response] };
    })
    .addNode("tools", toolNode)
    .addEdge("__start__", "agent")
    .addConditionalEdges("agent", shouldContinue, { tools: "tools", end: END })
    .addEdge("tools", "agent");

  const app = workflow.compile({ checkpointer: new MemorySaver() });

  const queries = [
    // 3-A: Getting Started
    {
      label: "3-A-1: framework-selection",
      query: "LangChainとLangGraphはどちらを使うべきか？ステートフルなワークフローを作りたい。framework-selectionスキルを使って教えてほしい。",
    },
    {
      label: "3-A-2: langchain-dependencies",
      query: "@langchain/coreと@langchain/langgraphの最新安定バージョンは何か？langchain-dependenciesスキルを使って教えてほしい。",
    },
    // 3-B: LangChain
    {
      label: "3-B-1: langchain-fundamentals",
      query: "create_agentを使ったReActエージェントのサンプルコードを見せてほしい。langchain-fundamentalsスキルを使って教えてほしい。",
    },
    // 3-C: LangGraph
    {
      label: "3-C-1: langgraph-fundamentals",
      query: "StateGraphを使ったシンプルなワークフローを定義するコードを教えてほしい。langgraph-fundamentalsスキルを使って教えてほしい。",
    },
    // 3-D: Deep Agents
    {
      label: "3-D-1: deep-agents-core",
      query: "SKILL.mdのフロントマターの正しい書き方と、FilesystemBackendでのロード方法を教えてほしい。deep-agents-coreスキルを使って。",
    },
  ];

  const results: QueryResult[] = [];
  for (const q of queries) {
    const result = await runQuery(app, q.query, q.label);
    results.push(result);
  }

  // 結果サマリー
  console.log("\n" + "=".repeat(60));
  console.log("結果サマリー:");
  for (const r of results) {
    const status = r.success ? "✅" : "❌";
    const toolInfo = r.toolsUsed.length > 0 ? ` [tools: ${r.toolsUsed.join(', ')}]` : "";
    console.log(`${status} ${r.label}${toolInfo}`);
  }

  // JSON 出力（結果ファイル生成用）
  console.log("\nJSON_RESULTS_START");
  console.log(JSON.stringify(results, null, 2));
  console.log("JSON_RESULTS_END");
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
