# LangGraph.JS Skills Test Environment

A test environment for verifying the functionality of LangGraph.JS skills.

## 📋 Overview

This project is an environment for implementing and testing reusable agent capabilities using [LangGraph.JS Skills](https://docs.langchain.com/oss/javascript/deepagents/skills).

## 🎯 Implemented Skills

### 1. langgraph-docs
A skill that accesses LangGraph documentation and provides up-to-date implementation guidance.

**Features:**
- Retrieves LangGraph documentation index
- Identifies relevant documentation URLs
- Provides accurate guidance based on the latest documentation

### 2. arxiv-search
A skill for searching research papers from the arXiv preprint repository.

**Features:**
- Paper search using the arXiv API
- Results sorted by relevance
- Formatted output including titles and abstracts

**Supported Fields:**
- Physics, Mathematics, Computer Science
- Quantitative Biology, Statistics
- Electrical Engineering, Systems Science, Economics

## 📁 Project Structure

```
SkillsTest/
├── src/
│   └── index.ts              # Main program
├── skills/
│   ├── langgraph-docs/
│   │   └── SKILL.md          # LangGraph documentation skill definition
│   └── arxiv_search/
│       ├── SKILL.md          # arXiv search skill definition
│       └── arxiv_search.ts   # arXiv search implementation
├── package.json              # Project configuration
├── tsconfig.json             # TypeScript configuration
├── .env.example              # Environment variables template
└── README.md                 # This file
```

## 🚀 Setup

### 1. Install Dependencies

```bash
npm install
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
npm start
```

Or in development mode (watches for file changes):

```bash
npm run dev
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
npm install
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

## ⚠️ Notes

- Be mindful of arXiv API rate limits (avoid excessive requests)
- Never commit API keys to public repositories
- The `.env` file is included in `.gitignore`
