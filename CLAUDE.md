# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a LangGraph.JS Skills test environment that demonstrates how to implement and test reusable agent capabilities using the Skills framework. The project uses OpenAI's GPT-4 model (via `@langchain/openai`) with FilesystemBackend to load skills from disk.

## Development Commands

### Running the Application

```bash
# Run the main test program
yarn start

# Run in development mode with file watching
yarn dev

# Run TypeScript type checking
yarn tsc --noEmit
```

### Testing Individual Skills

```bash
# Test the arXiv search skill directly
yarn tsx skills/arxiv_search/arxiv_search.ts "your query" --max-papers 5
```

### Installing Dependencies

```bash
yarn install
```

## Architecture

### Core Components

**Agent Setup Flow:**
1. Load environment variables (OPENAI_API_KEY from `.env`)
2. Initialize ChatOpenAI model with gpt-4o
3. Create MemorySaver for conversation state management
4. Set up FilesystemBackend pointing to `skills/` directory
5. Create ReActAgent with LLM, checkpointer, and skills backend

**Skills Backend:**
- Uses `FilesystemBackend` to dynamically load skills from the `skills/` directory
- Skills are loaded by passing `skills: ["/"]` in the agent config
- Each skill is defined by a `SKILL.md` file with frontmatter and instructions

**Message Flow:**
```
User Query → Agent Stream → Skill Selection → Tool Execution → Response
```

### Key Files

- **[src/index.ts](src/index.ts)**: Main entry point that initializes the agent and runs test queries
- **[skills/langgraph-docs/SKILL.md](skills/langgraph-docs/SKILL.md)**: Skill for accessing LangGraph documentation
- **[skills/arxiv_search/SKILL.md](skills/arxiv_search/SKILL.md)**: Skill definition for arXiv paper search
- **[skills/arxiv_search/arxiv_search.ts](skills/arxiv_search/arxiv_search.ts)**: Implementation of arXiv API integration

### Skill Structure

Each skill consists of:

1. **SKILL.md** - Defines the skill with:
   - YAML frontmatter (`name`, `description`)
   - Overview section explaining the skill's purpose
   - Instructions section with step-by-step guidance for the agent

2. **Optional implementation files** - TypeScript files that provide CLI tools or utilities (e.g., `arxiv_search.ts`)

## Environment Configuration

Required environment variables in `.env`:

```
OPENAI_API_KEY=your_openai_api_key_here
```

Use `.env.example` as a template:
```bash
cp .env.example .env
```

## Adding New Skills

To add a new skill:

1. Create a new directory under `skills/`:
   ```bash
   mkdir skills/my-new-skill
   ```

2. Create `SKILL.md` with proper frontmatter:
   ```markdown
   ---
   name: my-new-skill
   description: Brief description of what this skill does
   ---

   # My New Skill

   ## Overview
   Explain what the skill does...

   ## Instructions
   Step-by-step instructions for the agent...
   ```

3. (Optional) Add implementation files if the skill needs to execute code

4. The skill will be automatically loaded by FilesystemBackend on next run

## Implementation Notes

### Agent Configuration

- **thread_id**: Used for conversation state management with MemorySaver
- **skills: ["/"]**: Loads all skills from the root of the skills directory
- Skills are loaded dynamically at runtime by FilesystemBackend

### Model Selection

Currently using OpenAI GPT-4o (`gpt-4o`). To change models, update the model parameter in [src/index.ts](src/index.ts:22):

```typescript
const model = new ChatOpenAI({
  model: "gpt-4o",  // or "gpt-4-turbo", etc.
  apiKey: process.env.OPENAI_API_KEY,
});
```

### Stream Processing

The agent uses streaming responses. Each chunk contains potential message updates:

```typescript
for await (const chunk of stream) {
  if (chunk.agent?.messages) {
    // Process messages from agent
  }
}
```

## API Rate Limits

- **arXiv API**: Recommended rate limit is 1 request per second
- **OpenAI API**: Depends on your API plan and tier

## Dependencies

**Runtime:**
- `@langchain/openai`: OpenAI model integration
- `@langchain/core`: LangChain core functionality
- `@langchain/langgraph`: LangGraph framework and skills system
- `dotenv`: Environment variable management

**Development:**
- `typescript`: TypeScript compiler
- `tsx`: TypeScript execution runtime
- `@types/node`: Node.js type definitions

## Project Context

This is a demonstration/test environment for learning and experimenting with LangGraph.JS Skills. The README and documentation are in Japanese, indicating this is likely for Japanese-speaking developers learning the Skills framework.
