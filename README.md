# LangGraph.JS Skills Test Environment

A test environment for verifying the functionality of LangGraph.JS skills.

## 📋 Overview

This project is an environment for implementing and testing reusable agent capabilities using [LangGraph.JS Skills](https://docs.langchain.com/oss/javascript/deepagents/skills).

## 🎯 Implemented Skills

### Built-in Skills (2)

#### 1. langgraph-docs

A skill that accesses LangGraph documentation and provides up-to-date implementation guidance.

**Features:**
- Retrieves LangGraph documentation index
- Identifies relevant documentation URLs
- Provides accurate guidance based on the latest documentation

#### 2. arxiv-search

A skill for searching research papers from the arXiv preprint repository.

**Features:**
- Paper search using the arXiv API
- Results sorted by relevance
- Formatted output including titles and abstracts

**Supported Fields:**
- Physics, Mathematics, Computer Science
- Quantitative Biology, Statistics
- Electrical Engineering, Systems Science, Economics

### LangChain Skills v1 (11 skills)

Sourced from [langchain-ai/langchain-skills](https://github.com/langchain-ai/langchain-skills) and placed in `skills/langchain-skills/`.

| Category        | Skill                         | Description                                    |
|-----------------|-------------------------------|------------------------------------------------|
| Getting Started | `framework-selection`         | LangChain vs LangGraph selection guide         |
| Getting Started | `langchain-dependencies`      | Version management and dependency guidance     |
| LangChain       | `langchain-fundamentals`      | Agent creation, tools, structured output       |
| LangChain       | `langchain-middleware`        | Custom middleware and resume patterns          |
| LangChain       | `langchain-rag`               | RAG pipelines, document loaders, vector stores |
| LangGraph       | `langgraph-fundamentals`      | StateGraph, nodes, edges, state reducers       |
| LangGraph       | `langgraph-persistence`       | Checkpointers, thread_id, cross-thread memory  |
| LangGraph       | `langgraph-human-in-the-loop` | Interrupts, validation, approval workflows     |
| Deep Agents     | `deep-agents-core`            | Agent architecture and SKILL.md structure      |
| Deep Agents     | `deep-agents-memory`          | Persistent memory and filesystem middleware    |
| Deep Agents     | `deep-agents-orchestration`   | Sub-agents, task scheduling, HitL              |

All 13 skills (2 built-in + 11 LangChain Skills v1) are automatically loaded at runtime.

## 📁 Project Structure

```
langchain-skills-test/
├── src/
│   ├── index.ts                      # Main entry point (deepagents + FilesystemBackend)
│   ├── index-with-skills.ts          # Skills implementation example
│   ├── index-with-graph.ts           # Custom graph implementation example
│   ├── index-with-claude-tools.ts    # Claude tools integration example
│   └── experiments/
│       ├── local-shell.ts            # LocalShellBackend demo
│       ├── tools-stream.ts           # streamMode: "tools" demo
│       ├── standard-schema.ts        # Zod v4 + withStructuredOutput demo
│       ├── skill-queries.ts          # Skill queries demo
│       └── remaining-skill-queries.ts # Additional skill queries demo
├── skills/
│   ├── langgraph-docs/
│   │   └── SKILL.md                  # LangGraph documentation skill
│   ├── arxiv-search/
│   │   ├── SKILL.md                  # arXiv search skill definition
│   │   └── arxiv_search.ts           # arXiv API implementation
│   └── langchain-skills/             # LangChain Skills v1 (11 skills)
│       ├── framework-selection/SKILL.md
│       ├── langchain-dependencies/SKILL.md
│       ├── langchain-fundamentals/SKILL.md
│       ├── langchain-middleware/SKILL.md
│       ├── langchain-rag/SKILL.md
│       ├── langgraph-fundamentals/SKILL.md
│       ├── langgraph-persistence/SKILL.md
│       ├── langgraph-human-in-the-loop/SKILL.md
│       ├── deep-agents-core/SKILL.md
│       ├── deep-agents-memory/SKILL.md
│       └── deep-agents-orchestration/SKILL.md
├── package.json                      # Project dependencies and scripts
├── tsconfig.json                     # TypeScript configuration
├── .env.example                      # Environment variables template
├── .gitignore                        # Git ignore rules
├── README.md                         # This file (English)
├── CLAUDE.md                         # Project instructions for Claude Code
├── PROJECT_OVERVIEW.md               # Detailed project overview
├── QUICKSTART.md                     # Quick start guide
├── GRAPH_IMPLEMENTATION.md           # LangGraph implementation guide
└── yarn.lock                         # Yarn dependency lock file
```

## 🚀 Setup

### 1. Install Dependencies

```bash
yarn install
```

### 2. Configure Environment Variables

Copy `.env.example` to create a `.env` file and set your OpenAI API key.

```bash
cp .env.example .env
```

Edit the `.env` file:

```env
OPENAI_API_KEY=your_actual_api_key_here
```

You can obtain an API key from [OpenAI Platform](https://platform.openai.com/api-keys).

### 3. Run the Program

```bash
yarn start
```

Or in development mode (watches for file changes):

```bash
yarn dev
```

## 💡 Usage Examples

### Example 1: Testing the arXiv Search Skill

The program automatically tests arXiv search by searching for papers about Transformers in natural language processing.

```typescript
const query = "Search arXiv for papers about 'transformers in natural language processing' and show me the top 3 results.";
```

### Example 2: Testing the LangGraph Documentation Skill

The program automatically tests the LangGraph documentation skill and explains how to create a basic agent.

```typescript
const query = "Can you explain how to create a basic agent using LangGraph? Use the langgraph-docs skill to get the latest documentation.";
```

## 🔧 Customization

### Adding New Queries

You can edit `src/index.ts` to add your own queries:

```typescript
const customQuery = "Your custom query here";
const stream = await agent.stream(
  { messages: [{ role: "user", content: customQuery }] },
  config
);

for await (const chunk of stream) {
  if (chunk.agent?.messages) {
    for (const message of chunk.agent.messages) {
      console.log(`Agent: ${message.content}`);
    }
  }
}
```

### Adding New Skills

1. Create a new folder in the `skills/` directory
2. Create a `SKILL.md` file (including frontmatter and instructions)
3. Add TypeScript files as needed
4. Skills will be automatically loaded by FilesystemBackend

## 📚 How Skills Work

### SKILL.md Structure

Each skill is defined by a `SKILL.md` file and includes the following elements:

```markdown
---
name: skill-name
description: Brief description of what the skill does
---

# Skill Name

## Overview
Description...

## Instructions
Steps the agent should follow...
```

### FilesystemBackend

This project uses **FilesystemBackend** to directly load skill files from disk:

```typescript
const skillsBackend = new FilesystemBackend({
  rootDir: skillsPath,
});
```

### Loading Skills

Load all skills in the configuration:

```typescript
const config = {
  configurable: {
    thread_id: "skills-test-thread-1",
    skills: ["/"],  // Load all skills from root directory
  },
};
```

## 🔍 Troubleshooting

### API Key Error

```
Error: OPENAI_API_KEY is not set
```

**Solution:** Ensure that the `.env` file exists and a valid API key is set.

### Skills Not Loading

**Solution:**

- Verify that the path to the `skills/` directory is correct
- Ensure that each skill folder contains a `SKILL.md` file
- Confirm that the frontmatter in `SKILL.md` is in the correct format

### TypeScript Errors

```bash
yarn install
```

Reinstall dependencies.

## 📖 Reference Links

- [LangGraph.JS Skills Documentation](https://docs.langchain.com/oss/javascript/deepagents/skills)
- [LangGraph.JS GitHub Repository](https://github.com/langchain-ai/langgraphjs)
- [DeepAgents.JS Examples](https://github.com/langchain-ai/deepagentsjs)
- [OpenAI API Documentation](https://platform.openai.com/docs)

## 📝 License

MIT

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

## 🔗 Related Projects

This project is part of a broader ecosystem for AI agent development. Check out these related projects:

### [kudosflow](https://github.com/akudo7/kudosflow) 🌟

Visual Workflow Editor for AI Agents with Skills Support

- 🎨 Drag-and-drop node-based workflow builder
- ✨ **Native LangGraph.JS Skills support** - Import and use skills directly in your workflows
- 🔌 A2A Protocol integration for agent communication
- ⚡ Real-time execution and monitoring
- 🛠️ Built with TypeScript

Perfect for visually designing and testing AI agent workflows. Skills developed in this project can be directly imported and used in kudosflow!

### [a2a-server](https://github.com/akudo7/a2a-server)

Production-Ready A2A Protocol Server

- 🌐 Dual protocol support: HTTP REST + JSON-RPC 2.0
- 📊 SceneGraphManager v2.1.0 integration
- 🔄 JSON-driven AI workflow orchestration with LangGraph
- 🚀 Production-ready deployment architecture
- 🛠️ Built with TypeScript

Enterprise-grade server for orchestrating AI agent workflows at scale.

### [OpenAgentJson](https://github.com/akudo7/OpenAgentJson)

Declarative JSON Format for AI Workflows

- 📝 Specification for JSON-based agent workflow definitions
- 🔧 Works seamlessly with LangGraph.js
- 📚 Standard format for sharing and versioning workflows
- 🌍 Language-agnostic workflow definitions

Define your AI agent workflows as code using a standardized JSON format.

---

**Development Workflow**: Develop skills in this project → Visualize in kudosflow → Deploy with a2a-server → Define with OpenAgentJson

## ⚠️ Notes

- Be mindful of arXiv API rate limits (avoid excessive requests)
- Never commit API keys to public repositories
- The `.env` file is included in `.gitignore`
