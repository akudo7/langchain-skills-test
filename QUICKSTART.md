# Quick Start Guide

## 🚀 Get Started in 3 Steps

### Step 1: Installation

```bash
yarn install
```

### Step 2: Configure API Key

```bash
# Create .env file
cp .env.example .env

# Open .env in your editor and set your API key
# OPENAI_API_KEY=sk-...
```

### Step 3: Run

```bash
yarn start
```

## 📊 Expected Output

When you run the program, you should see output similar to this:

```text
🚀 LangGraph.JS Skills Test Environment

📁 Loading skills from: /path/to/skills

✅ Agent initialized with 13 skills:

   - langgraph-docs: Access LangGraph documentation
   - arxiv-search: Search arXiv research papers
   - framework-selection: LangChain vs LangGraph selection guide
   - ... (11 LangChain Skills v1)

============================================================

📚 Example 1: Testing arxiv-search skill
------------------------------------------------------------
Query: Search arXiv for papers about 'transformers in natural language processing' and show me the top 3 results.

Agent: [Agent response]
...
```

## 🧪 Testing Individual Skills

### Test arXiv Search Skill Independently

```bash
npx tsx skills/arxiv-search/arxiv_search.ts "quantum computing" --max-papers 3
```

### Running Custom Queries

Add the following to the end of `src/index.ts`:

```typescript
// Custom test
const customStream = await agent.stream(
  { messages: [{ role: "user", content: "Your query here" }] },
  config
);

for await (const chunk of customStream) {
  if (chunk.agent?.messages) {
    for (const message of chunk.agent.messages) {
      console.log(`Agent: ${message.content}`);
    }
  }
}
```

## 💡 Useful Commands

```bash
# Development mode (watches for file changes)
yarn dev

# Run arxiv_search.ts directly
npx tsx skills/arxiv-search/arxiv_search.ts "your query"

# TypeScript type checking
npx tsc --noEmit
```

## 🔍 Debugging Tips

### Enable Detailed Logging

Add the following to `src/index.ts`:

```typescript
// Check all chunks in stream processing
for await (const chunk of stream) {
  console.log("Chunk:", JSON.stringify(chunk, null, 2));
}
```

### Verify Skills Are Loaded

```typescript
console.log("Skills backend:", skillsBackend);
console.log("Config:", config);
```

## ❓ Frequently Asked Questions

**Q: Agent not using skills?**

A: Try explicitly including the skill name in your query:

```typescript
"Use the arxiv-search skill to find papers about..."
```

**Q: Getting API rate limit errors?**

A: Add wait time between requests:

```typescript
await new Promise(resolve => setTimeout(resolve, 1000));
```

**Q: Skill responses are slow?**

A: This is normal. The agent reads skill instructions, executes tools, and processes results.

## 🎯 Next Steps

1. ✅ Verify basic execution
2. ✅ Test both skills
3. 📝 Try your own queries
4. 🔧 Add new skills
5. 🚀 Customize for production

For more details, see [README.md](README.md).
