# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a LangGraph.JS Skills test environment that demonstrates how to implement and test reusable agent capabilities using the Skills framework. The project uses OpenAI's GPT-4 model (via `@langchain/openai`) with FilesystemBackend to load skills from disk.

## Development Commands

### Running the Application

```bash
# Run the main test program (deepagents + FilesystemBackend)
yarn start

# Run with Claude-style tools (index-with-claude-tools.ts)
yarn start:claude

# Run in development mode with file watching
yarn dev

# Run TypeScript type checking
yarn tsc --noEmit
```

### Testing Individual Skills

```bash
# Test the arXiv search skill directly
yarn tsx skills/arxiv-search/arxiv_search.ts "your query" --max-papers 5
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
3. Create FilesystemBackend pointing to project root
4. Create agent with `createDeepAgent` (deepagents) or `createReactAgent` (langgraph)
5. Skills loaded via `skills: ["/skills/"]` config

**Skills Backend:**

- Uses `FilesystemBackend` (deepagents) to dynamically load skills from the `skills/` directory
- Skills are loaded by passing `skills: ["/skills/"]` in the agent config
- Each skill is defined by a `SKILL.md` file with frontmatter and instructions
- `src/index-with-claude-tools.ts` uses recursive scan to detect nested skills

**Message Flow:**
```
User Query → Agent → Skill Selection (read_file) → Tool Execution → Response
```

### Key Files

- **[src/index.ts](src/index.ts)**: Main entry point using `createDeepAgent` with `FilesystemBackend`
- **[src/index-with-claude-tools.ts](src/index-with-claude-tools.ts)**: Alternative entry with manual skill loading (recursive scan)
- **[src/experiments/local-shell.ts](src/experiments/local-shell.ts)**: `LocalShellBackend` demo
- **[src/experiments/tools-stream.ts](src/experiments/tools-stream.ts)**: `streamMode: "tools"` demo
- **[src/experiments/standard-schema.ts](src/experiments/standard-schema.ts)**: Zod v4 + `withStructuredOutput` demo
- **[src/experiments/skill-queries.ts](src/experiments/skill-queries.ts)**: skill queries demo
- **[skills/langgraph-docs/SKILL.md](skills/langgraph-docs/SKILL.md)**: LangGraph documentation skill
- **[skills/arxiv-search/SKILL.md](skills/arxiv-search/SKILL.md)**: arXiv paper search skill
- **[skills/langchain-skills/](skills/langchain-skills/)**: 11 skills from `langchain-ai/langchain-skills`

### Skills Directory Structure

```
skills/
├── arxiv-search/
│   ├── SKILL.md
│   └── arxiv_search.ts
├── langgraph-docs/
│   └── SKILL.md
└── langchain-skills/         ← langchain-ai/langchain-skills (11 skills)
    ├── framework-selection/SKILL.md
    ├── langchain-dependencies/SKILL.md
    ├── langchain-fundamentals/SKILL.md
    ├── langchain-middleware/SKILL.md
    ├── langchain-rag/SKILL.md
    ├── langgraph-fundamentals/SKILL.md
    ├── langgraph-persistence/SKILL.md
    ├── langgraph-human-in-the-loop/SKILL.md
    ├── deep-agents-core/SKILL.md
    ├── deep-agents-memory/SKILL.md
    └── deep-agents-orchestration/SKILL.md
```

Total: 13 skills loaded at runtime.

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

- **thread_id**: Used for conversation state management
- **skills: ["/skills/"]**: Loads skills from the `skills/` directory
- Skills with nested structure (e.g., `skills/langchain-skills/`) require recursive scan

### LocalShellBackend

New in `deepagents` 1.8.0. Executes local shell commands as agent tools.

```typescript
import { LocalShellBackend } from "deepagents";

const shellBackend = new LocalShellBackend();
await shellBackend.initialize();

// execute() returns an object, not a string
const result = await shellBackend.execute("ls -la");
// { output: "...", exitCode: 0, truncated: false }
console.log(result.output);

await shellBackend.close();
```

**Note**: No sandbox by default. Use `BaseSandbox` for sandboxed execution.

### tools Stream Mode

New in `@langchain/langgraph` 1.2.0. Observe tool lifecycle events.

```typescript
const stream = await agent.stream(input, {
  streamMode: "tools",
  configurable: { thread_id }
});

for await (const event of stream) {
  // { event: "on_tool_start", toolCallId, name, input }
  // { event: "on_tool_end",   toolCallId, name, output }
}
```

| streamMode  | Events | Content                    |
|-------------|--------|----------------------------|
| `messages`  | ~65    | Message chunks (streaming) |
| `tools`     | ~4     | Tool lifecycle events only |
| `updates`   | ~3     | Node-level state updates   |

### Standard Schema (Zod v4)

`@langchain/core` 1.1.31 supports Zod v4 schemas directly in `withStructuredOutput`.

```typescript
import { z } from "zod";

const Schema = z.object({
  title: z.string(),
  keywords: z.array(z.string()),
  confidence: z.number(),
});

const structuredModel = model.withStructuredOutput(Schema);
const result = await structuredModel.invoke("...");
// result is typed as { title: string; keywords: string[]; confidence: number }

// With raw output:
const structuredModelRaw = model.withStructuredOutput(Schema, { includeRaw: true });
const { parsed, raw } = await structuredModelRaw.invoke("...");
```

### Model Selection

Currently using OpenAI GPT-4o (`gpt-4o`). To change models, update the model parameter in [src/index.ts](src/index.ts):

```typescript
const model = new ChatOpenAI({
  model: "gpt-4o",  // or "gpt-4-turbo", etc.
  apiKey: process.env.OPENAI_API_KEY,
});
```

## API Rate Limits

- **arXiv API**: Recommended rate limit is 1 request per second
- **OpenAI API**: Depends on your API plan and tier

## Dependencies

**Runtime:**

- `@langchain/openai`: ^1.2.12 — OpenAI model integration (Standard Schema support)
- `@langchain/core`: ^1.1.31 — LangChain core (Zod v4 / Standard Schema)
- `@langchain/langgraph`: ^1.2.1 — LangGraph framework (`tools` stream mode, `Overwrite` channel, `StateSchema`)
- `deepagents`: ^1.8.1 — Skills framework (`LocalShellBackend`, summarization middleware)
- `zod`: ^4.3.6 — Schema validation (v4)
- `dotenv`: ^16.4.7 — Environment variable management

**Development:**

- `typescript`: ^5.7.3
- `tsx`: ^4.19.2
- `@types/node`: ^22.10.5

## Project Context

This is a demonstration/test environment for learning and experimenting with LangGraph.JS Skills and related packages. Verified against LangChain Skills v1 release (2026-03-09).

See [docs/skills-exploration-plan/results/summary.md](docs/skills-exploration-plan/results/summary.md) for full verification results.
