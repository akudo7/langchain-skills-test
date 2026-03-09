/**
 * tools ストリームモード動作確認
 * @langchain/langgraph 1.2.0 新機能
 */
import { ChatOpenAI } from "@langchain/openai";
import * as path from "path";
import * as url from "url";
import * as dotenv from "dotenv";
import { StateGraph, Annotation, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { randomUUID } from "crypto";

dotenv.config();
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
  }),
});

function shouldContinue(state: typeof StateAnnotation.State): "tools" | "end" {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) return "tools";
  return "end";
}

async function main() {
  console.log("=".repeat(60));
  console.log("tools ストリームモード動作確認");
  console.log("=".repeat(60));

  const model = new ChatOpenAI({
    model: "gpt-4o",
    apiKey: process.env.OPENAI_API_KEY,
  });

  // シンプルな計算ツール（ツールイベント観測用）
  const addTool = new DynamicStructuredTool({
    name: "add",
    description: "Add two numbers together",
    schema: z.object({
      a: z.number().describe("First number"),
      b: z.number().describe("Second number"),
    }),
    func: async ({ a, b }) => {
      return `${a} + ${b} = ${a + b}`;
    },
  });

  const multiplyTool = new DynamicStructuredTool({
    name: "multiply",
    description: "Multiply two numbers",
    schema: z.object({
      a: z.number().describe("First number"),
      b: z.number().describe("Second number"),
    }),
    func: async ({ a, b }) => {
      return `${a} × ${b} = ${a * b}`;
    },
  });

  const tools = [addTool, multiplyTool];
  const modelWithTools = model.bindTools(tools);
  const toolNode = new ToolNode(tools);

  const workflow = new StateGraph(StateAnnotation)
    .addNode("agent", async (state) => {
      const response = await modelWithTools.invoke(state.messages);
      return { messages: [response] };
    })
    .addNode("tools", toolNode)
    .addEdge("__start__", "agent")
    .addConditionalEdges("agent", shouldContinue, { tools: "tools", end: END })
    .addEdge("tools", "agent");

  const app = workflow.compile({ checkpointer: new MemorySaver() });

  const query = "3 + 5 を計算して、その結果に 2 を掛けてほしい";
  const threadId = randomUUID();

  // --- テスト1: streamMode: "messages" (既存) ---
  console.log("\n--- テスト1: streamMode: 'messages' (既存モード) ---");
  console.log(`Query: ${query}`);

  const messagesEvents: string[] = [];
  const messagesStream = await app.stream(
    { messages: [new HumanMessage(query)] },
    { streamMode: "messages", configurable: { thread_id: threadId } }
  );

  for await (const chunk of messagesStream) {
    const [msg, meta] = chunk as [any, any];
    const eventType = msg.constructor?.name || typeof msg;
    const preview = typeof msg.content === 'string' ? msg.content.substring(0, 50) : '';
    messagesEvents.push(`[${eventType}] langgraph_node=${meta?.langgraph_node} content="${preview}"`);
  }

  console.log(`✅ messages モード: ${messagesEvents.length} events received`);
  messagesEvents.slice(0, 5).forEach(e => console.log(`   ${e}`));
  if (messagesEvents.length > 5) console.log(`   ... and ${messagesEvents.length - 5} more`);

  // --- テスト2: streamMode: "tools" (新機能) ---
  console.log("\n--- テスト2: streamMode: 'tools' (新機能) ---");

  const toolsEvents: string[] = [];
  let toolsStreamSupported = false;

  try {
    const toolsStream = await app.stream(
      { messages: [new HumanMessage(query)] },
      { streamMode: "tools", configurable: { thread_id: randomUUID() } }
    );

    for await (const chunk of toolsStream) {
      toolsStreamSupported = true;
      const chunkStr = JSON.stringify(chunk).substring(0, 100);
      toolsEvents.push(chunkStr);
    }

    console.log(`✅ tools モード: ${toolsEvents.length} events received`);
    toolsEvents.slice(0, 5).forEach(e => console.log(`   ${e}`));
    if (toolsEvents.length > 5) console.log(`   ... and ${toolsEvents.length - 5} more`);
  } catch (error: any) {
    console.log(`⚠️  tools ストリームモード: ${error.message}`);
    console.log("   (このバージョンでは未サポートまたは異なる API の可能性があります)");
  }

  // --- テスト3: streamMode: "updates" (別の新モード) ---
  console.log("\n--- テスト3: streamMode: 'updates' ---");

  const updatesEvents: string[] = [];
  try {
    const updatesStream = await app.stream(
      { messages: [new HumanMessage(query)] },
      { streamMode: "updates", configurable: { thread_id: randomUUID() } }
    );

    for await (const chunk of updatesStream) {
      const nodeNames = Object.keys(chunk);
      updatesEvents.push(`nodes: [${nodeNames.join(', ')}]`);
    }

    console.log(`✅ updates モード: ${updatesEvents.length} events received`);
    updatesEvents.forEach(e => console.log(`   ${e}`));
  } catch (error: any) {
    console.log(`⚠️  updates ストリームモード: ${error.message}`);
  }

  console.log("\n=== tools ストリームモード確認結果 ===");
  console.log(`✅ streamMode: "messages" - ${messagesEvents.length} events`);
  console.log(`${toolsStreamSupported ? '✅' : '⚠️ '} streamMode: "tools" - ${toolsStreamSupported ? `${toolsEvents.length} events` : 'not supported in this version'}`);
  console.log(`✅ streamMode: "updates" - ${updatesEvents.length} events`);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
