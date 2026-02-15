import { ChatOpenAI } from "@langchain/openai";
import * as path from "path";
import * as url from "url";
import * as dotenv from "dotenv";
import { createDeepAgent, FilesystemBackend } from "deepagents";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { queryArxiv } from "../skills/arxiv-search/arxiv_search.js";

// Load environment variables
dotenv.config();

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

/**
 * Main function to demonstrate LangGraph.JS skills functionality
 */
async function main() {
  console.log("🚀 LangGraph.JS Skills Test Environment with Deep Agents\n");

  // Initialize the model
  const model = new ChatOpenAI({
    model: "gpt-4o",
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Set up skills path
  const skillsPath = path.join(__dirname, "..", "skills");
  console.log(`📁 Skills directory: ${skillsPath}\n`);

  // Create FilesystemBackend pointing to the project root
  const backend = new FilesystemBackend({
    rootDir: path.join(__dirname, ".."),
    virtualMode: true,
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

  // Create the agent with FilesystemBackend, skills, and custom tools
  const agent = createDeepAgent({
    model: model,
    backend: backend,
    skills: ["/skills/"],
    tools: [arxivSearchTool],
  });

  // Configure thread ID for conversation state
  const config = {
    configurable: {
      thread_id: "skills-test-thread-1",
    },
  };

  console.log("✅ Agent initialized with FilesystemBackend\n");
  console.log("   - Skills loaded from: skills/\n");
  console.log("=" .repeat(60) + "\n");

  // Example 1: Test arxiv-search skill
  console.log("📚 Example 1: Testing arxiv-search skill");
  console.log("-" .repeat(60));

  const arxivQuery = "Search arXiv for papers about 'transformers in natural language processing' and show me the top 3 results.";
  console.log(`Query: ${arxivQuery}\n`);

  const arxivResult = await agent.invoke(
    { messages: [{ role: "user", content: arxivQuery }] },
    config
  );

  // Get the last message from the agent
  const arxivMessages = arxivResult.messages;
  if (arxivMessages && arxivMessages.length > 0) {
    const lastMessage = arxivMessages[arxivMessages.length - 1];
    console.log(`\nAgent Response:\n${lastMessage.content}\n`);
  }

  console.log("\n" + "=" .repeat(60) + "\n");

  // Example 2: Test langgraph-docs skill (commented out due to rate limits)
  console.log("📖 Example 2: Testing langgraph-docs skill");
  console.log("-" .repeat(60));
  const docsQuery = "Can you explain how to create a basic agent using LangGraph? Use the langgraph-docs skill to get the latest documentation.";
  console.log(`Query: ${docsQuery}\n`);
    const docsResult = await agent.invoke(
    { messages: [{ role: "user", content: docsQuery }] },
    config
  );
  // Get the last message from the agent
  const docsMessages = docsResult.messages;
  if (docsMessages && docsMessages.length > 0) {
    const lastMessage = docsMessages[docsMessages.length - 1];
    console.log(`\nAgent Response:\n${lastMessage.content}\n`);
  }

  console.log("\n" + "=" .repeat(60));
  console.log("\n✨ Skills test completed successfully!");
}

// Run the main function
main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
