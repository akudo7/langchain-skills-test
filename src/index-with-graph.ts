import { ChatOpenAI } from "@langchain/openai";
import * as path from "path";
import * as url from "url";
import * as dotenv from "dotenv";
import { StateGraph, Annotation, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { queryArxiv } from "../skills/arxiv-search/arxiv_search.js";
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";

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
 * Agent node: Calls the model to select tools
 */
async function callModel(
  state: typeof StateAnnotation.State,
  config: { configurable?: { model?: ChatOpenAI } }
) {
  const messages = state.messages;
  const model = config.configurable?.model;

  if (!model) {
    throw new Error("Model not provided in config");
  }

  const response = await model.invoke(messages);
  return { messages: [response] };
}

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
 * Main function to demonstrate LangGraph with explicit nodes and edges
 */
async function main() {
  console.log("🚀 LangGraph.JS with Explicit Nodes and Edges\n");

  // Initialize the model
  const model = new ChatOpenAI({
    model: "gpt-4o",
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Create custom arXiv search tool
  const arxivSearchTool = new DynamicStructuredTool({
    name: "arxiv_search",
    description: "Search arXiv preprint repository for papers in physics, mathematics, computer science, quantitative biology, and related fields. Use this when you need to find recent research papers.",
    schema: z.object({
      query: z.string().describe("The search query string"),
      maxPapers: z.number().optional().default(10).describe("Maximum number of papers to retrieve (default: 10)"),
    }),
    func: async ({ query, maxPapers }) => {
      return await queryArxiv(query, maxPapers);
    },
  });

  // Bind tools to the model
  const modelWithTools = model.bindTools([arxivSearchTool]);

  // Create ToolNode
  const toolNode = new ToolNode([arxivSearchTool]);

  // Build the graph
  console.log("🔧 Building StateGraph with nodes and edges...\n");

  const workflow = new StateGraph(StateAnnotation)
    // Add nodes
    .addNode("agent", async (state) => {
      const messages = state.messages;
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
  console.log("   Nodes: agent, tools");
  console.log("   Edges:");
  console.log("     - START → agent");
  console.log("     - agent → tools (if tool calls exist)");
  console.log("     - agent → END (if no tool calls)");
  console.log("     - tools → agent (loop back)");
  console.log("\n" + "=".repeat(60) + "\n");

  // Configure thread ID for conversation state
  const config = {
    configurable: {
      thread_id: "graph-test-thread-1",
    },
  };

  // Example 1: Test arxiv-search tool
  console.log("📚 Example 1: Testing arXiv search with explicit graph");
  console.log("-".repeat(60));

  const arxivQuery = "Search arXiv for papers about 'transformers in natural language processing' and show me the top 3 results.";
  console.log(`Query: ${arxivQuery}\n`);

  const arxivResult = await app.invoke(
    { messages: [new HumanMessage(arxivQuery)] },
    config
  );

  // Get the last message from the agent
  const arxivMessages = arxivResult.messages;
  if (arxivMessages && arxivMessages.length > 0) {
    const lastMessage = arxivMessages[arxivMessages.length - 1];
    console.log(`\nAgent Response:\n${lastMessage.content}\n`);
  }

  console.log("\n" + "=".repeat(60) + "\n");

  // Example 2: Simple conversation without tools
  console.log("💬 Example 2: Simple conversation (no tools)");
  console.log("-".repeat(60));

  const simpleQuery = "What is the capital of France?";
  console.log(`Query: ${simpleQuery}\n`);

  const simpleResult = await app.invoke(
    { messages: [new HumanMessage(simpleQuery)] },
    config
  );

  const simpleMessages = simpleResult.messages;
  if (simpleMessages && simpleMessages.length > 0) {
    const lastMessage = simpleMessages[simpleMessages.length - 1];
    console.log(`\nAgent Response:\n${lastMessage.content}\n`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("\n✨ Graph-based agent test completed successfully!");
}

// Run the main function
main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
