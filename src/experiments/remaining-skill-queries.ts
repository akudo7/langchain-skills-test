/**
 * Phase 6: 未確認スキルの動作確認
 * langchain-middleware / langchain-rag / langgraph-persistence /
 * langgraph-human-in-the-loop / deep-agents-memory / deep-agents-orchestration
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
    const response = String(lastMsg.content).substring(0, 1000);
    console.log(`Response (first 1000 chars): ${response}`);
    console.log(`Tools used: ${toolsUsed.join(', ') || 'none'}`);

    return { label, query, response: String(lastMsg.content), toolsUsed, success: true };
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    return { label, query, response: `ERROR: ${error.message}`, toolsUsed: [], success: false };
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("Phase 6: 未確認スキルの動作確認");
  console.log("=".repeat(60));

  const model = new ChatOpenAI({
    model: "gpt-4o",
    apiKey: process.env.OPENAI_API_KEY,
  });

  const backend = new FilesystemBackend({
    rootDir: path.join(__dirname, "../.."),
    virtualMode: true,
  });

  const skills = await loadSkillsMetadata(backend, "/skills");
  console.log(`\nLoaded ${skills.length} skills`);

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
          : path.join(__dirname, "../..", file_path);
        return readFileSync(absolutePath, "utf-8");
      } catch (error: any) {
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
    // 6-A: LangChain カテゴリ
    {
      label: "6-A-1: langchain-middleware",
      query: "HumanInTheLoopMiddleware を使って危険なツール呼び出し（例: send_email）を人間の承認待ちにする TypeScript のサンプルコードを教えてほしい。langchain-middlewareスキルを使って。",
    },
    {
      label: "6-A-2: langchain-rag",
      query: "TypeScript で RAG パイプラインを構築する方法を教えてほしい。ドキュメントのロード・チャンク分割・埋め込み・ベクトルストア検索まで含めて。langchain-ragスキルを使って。",
    },
    // 6-B: LangGraph カテゴリ
    {
      label: "6-B-1: langgraph-persistence",
      query: "LangGraph で会話履歴を複数ターン保持するために MemorySaver を使う方法と、thread_id の役割を TypeScript で説明してほしい。langgraph-persistenceスキルを使って。",
    },
    {
      label: "6-B-2: langgraph-human-in-the-loop",
      query: "LangGraph の interrupt() と Command(resume=...) を使って人間の承認を待つグラフを TypeScript で実装するサンプルを見せてほしい。langgraph-human-in-the-loopスキルを使って。",
    },
    // 6-C: Deep Agents カテゴリ
    {
      label: "6-C-1: deep-agents-memory",
      query: "Deep Agent で /memories/ パス配下のファイルをスレッドをまたいで永続化するために CompositeBackend と StoreBackend を組み合わせる TypeScript の方法を教えてほしい。deep-agents-memoryスキルを使って。",
    },
    {
      label: "6-C-2: deep-agents-orchestration",
      query: "Deep Agent でサブエージェントを使って複雑なタスクを委譲する方法を TypeScript で教えてほしい。カスタムサブエージェントの定義方法も含めて。deep-agents-orchestrationスキルを使って。",
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
