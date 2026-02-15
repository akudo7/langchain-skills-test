# Project Overview

## 🎯 Project Purpose

A complete environment has been built to verify the operation of LangGraph.JS skills functionality. This project includes multiple implementation approaches:

- **Skills Framework**: Using ReActAgent with FilesystemBackend for skill management
- **Custom Graph**: Manual graph implementation using StateGraph
- **Native Tools**: Direct tool integration with Claude/OpenAI models

The default implementation uses OpenAI's GPT-4o model with the Skills framework.

## 📦 List of Created Files

### Core Configuration Files

- ✅ [package.json](package.json) - Project configuration and dependencies
- ✅ [tsconfig.json](tsconfig.json) - TypeScript configuration
- ✅ [.env.example](.env.example) - Environment variable template
- ✅ [.gitignore](.gitignore) - Git exclusion configuration

### Main Programs

- ✅ [src/index.ts](src/index.ts) - Main program (OpenAI GPT-4o with Skills)
- ✅ [src/index-with-skills.ts](src/index-with-skills.ts) - Agent using Skills framework
- ✅ [src/index-with-graph.ts](src/index-with-graph.ts) - Custom graph implementation
- ✅ [src/index-with-claude-tools.ts](src/index-with-claude-tools.ts) - Claude with native tools

### Skills Implementation

#### 1. langgraph-docs Skill

- ✅ [skills/langgraph-docs/SKILL.md](skills/langgraph-docs/SKILL.md)
  - Provides access to LangGraph documentation
  - Retrieves documentation using the fetch_url tool
  - Provides the latest implementation guidance

#### 2. arxiv-search Skill

- ✅ [skills/arxiv-search/SKILL.md](skills/arxiv-search/SKILL.md)
  - Definition and usage of the arXiv search skill
- ✅ [skills/arxiv-search/arxiv_search.ts](skills/arxiv-search/arxiv_search.ts)
  - Implementation of paper search using arXiv API
  - Command-line argument support
  - XML response parsing

### Documentation

- ✅ [README.md](README.md) - Detailed project documentation
- ✅ [QUICKSTART.md](QUICKSTART.md) - Quick start guide
- ✅ [CLAUDE.md](CLAUDE.md) - Instructions for Claude Code
- ✅ [GRAPH_IMPLEMENTATION.md](GRAPH_IMPLEMENTATION.md) - Custom graph implementation details
- ✅ [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) - This file

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│         LangGraph.JS Agent                  │
│  (OpenAI GPT-4o / Claude + ReActAgent)     │
└────────────┬────────────────────────────────┘
             │
             │ uses
             ↓
┌─────────────────────────────────────────────┐
│       FilesystemBackend                     │
│   (loads skills from disk)                  │
└────────────┬────────────────────────────────┘
             │
             │ reads
             ↓
┌─────────────────────────────────────────────┐
│           Skills Directory                   │
│                                             │
│  ┌──────────────────┐  ┌─────────────────┐│
│  │ langgraph-docs   │  │  arxiv-search   ││
│  │  └─ SKILL.md     │  │  ├─ SKILL.md    ││
│  │                  │  │  └─ arxiv_      ││
│  │                  │  │     search.ts   ││
│  └──────────────────┘  └─────────────────┘│
└─────────────────────────────────────────────┘
```

## 🔑 Key Implementation Points

### 1. Using FilesystemBackend

```typescript
const skillsBackend = new FilesystemBackend({
  rootDir: skillsPath,
});
```

- Directly loads skill files from disk
- Relative path-based management
- Optimal for development environments

### 2. Skill Structure

Each skill consists of the following elements:

```markdown
---
name: skill-name
description: Skill description
---

# Skill Name

## Overview
Overview description

## Instructions
Specific steps for the agent to follow
```

### 3. Creating ReActAgent

```typescript
const agent = createReactAgent({
  llm: model,
  checkpointSaver: checkpointer,
  skillsBackend,
});
```

- Uses OpenAI GPT-4o model (default) or Claude 3.5 Sonnet
- Manages conversation state with MemorySaver
- Integrates skillsBackend

### 4. Stream Processing

```typescript
const stream = await agent.stream(
  { messages: [{ role: "user", content: query }] },
  config
);

for await (const chunk of stream) {
  if (chunk.agent?.messages) {
    // Message processing
  }
}
```

## 📊 Dependencies

### Main Dependencies

- `@langchain/openai` - OpenAI model integration (GPT-4o)
- `@langchain/anthropic` - Claude AI model integration
- `@langchain/core` - LangChain core functionality
- `@langchain/langgraph` - LangGraph and skills functionality
- `dotenv` - Environment variable management

### Development Dependencies

- `typescript` - TypeScript language
- `tsx` - TypeScript execution environment
- `@types/node` - Node.js type definitions

## 🚀 Execution Flow

1. **Initialization**
   ```
   Load environment variables → Initialize model → Configure backend
   ```

2. **Load Skills**
   ```
   FilesystemBackend → Parse SKILL.md → Register skills
   ```

3. **Agent Execution**
   ```
   User query → Skill selection → Tool execution → Return results
   ```

4. **Streaming Output**
   ```
   Process each chunk → Extract messages → Console output
   ```

## 🧪 Test Scenarios

### Scenario 1: arXiv Search

```typescript
"Search arXiv for papers about 'transformers in natural language processing'
and show me the top 3 results."
```

**Expected Behavior:**

1. Agent recognizes the arxiv-search skill
2. Executes arxiv_search.ts
3. Retrieves results from arXiv API
4. Returns formatted results

### Scenario 2: LangGraph Documentation

```typescript
"Can you explain how to create a basic agent using LangGraph?
Use the langgraph-docs skill to get the latest documentation."
```

**Expected Behavior:**

1. Agent recognizes the langgraph-docs skill
2. Retrieves documentation using the fetch_url tool
3. Selects relevant documentation
4. Generates an explanation based on the documentation

## 🔧 Customization Guide

### Adding New Skills

1. **Create a skill directory**
   ```bash
   mkdir -p skills/my-new-skill
   ```

2. **Create SKILL.md**
   ```markdown
   ---
   name: my-new-skill
   description: Skill description
   ---

   # My New Skill

   ## Instructions
   Describe the steps...
   ```

3. **Add implementation files as needed**
   ```typescript
   // skills/my-new-skill/implementation.ts
   ```

4. **Automatically loaded**
   - FilesystemBackend auto-detects
   - Available after restart

### Changing the Model

**Using OpenAI (default):**

```typescript
import { ChatOpenAI } from "@langchain/openai";

const model = new ChatOpenAI({
  model: "gpt-4o", // or "gpt-4-turbo", "gpt-3.5-turbo"
  apiKey: process.env.OPENAI_API_KEY,
});
```

**Using Claude:**

```typescript
import { ChatAnthropic } from "@langchain/anthropic";

const model = new ChatAnthropic({
  model: "claude-3-5-sonnet-20241022", // or "claude-3-opus-20240229"
  apiKey: process.env.ANTHROPIC_API_KEY,
});
```

### Switching Backends

```typescript
// When using StateBackend
import { StateBackend } from "@langchain/langgraph/skills";

const skillsBackend = new StateBackend({
  skills: {
    "/skills/custom-skill": {
      "SKILL.md": "...",
    },
  },
});
```

## 📈 Performance Considerations

### API Limits

- **arXiv API**: 1 request per second recommended
- **OpenAI API**: Depends on your API plan and tier
- **Anthropic API**: Limits based on usage plan

### Optimization Tips

1. Keep skill selection to a minimum
2. Avoid loading large amounts of documentation at once
3. Consider implementing caching mechanisms

## 🎓 Learning Resources

### Official Documentation

- [LangGraph.JS Skills](https://docs.langchain.com/oss/javascript/deepagents/skills)
- [LangGraph.JS API Reference](https://js.langchain.com/docs/langgraph)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Anthropic Claude API](https://docs.anthropic.com/)

### Sample Implementations

- [DeepAgents.JS Examples](https://github.com/langchain-ai/deepagentsjs)
- [LangGraph.JS Repository](https://github.com/langchain-ai/langgraphjs)

## ✅ Checklist

Verify that the environment is set up correctly:

- [ ] Node.js v18 or higher is installed
- [ ] `yarn install` or `npm install` succeeded
- [ ] `.env` file is created with `OPENAI_API_KEY` (or `ANTHROPIC_API_KEY`)
- [ ] Two skills exist in the `skills/` directory (langgraph-docs, arxiv-search)
- [ ] `yarn start` or `npm start` runs without errors
- [ ] Agent recognizes both skills
- [ ] All four implementation files are present in `src/` directory

## 🆘 Support

If you encounter issues:

1. Check the FAQ in [QUICKSTART.md](QUICKSTART.md)
2. Check the troubleshooting section in [README.md](README.md)
3. Reinstall dependencies: `rm -rf node_modules && npm install`
4. Check for TypeScript type errors: `npx tsc --noEmit`

## 🎉 Complete!

This project is a complete environment for running the LangGraph.JS skills functionality in action.
Run `npm start` to see the skills in operation!
