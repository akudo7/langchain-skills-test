# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [1.1.0] - 2026-03-10

### Added

- `skills/langchain-skills/`: 11 skills from `langchain-ai/langchain-skills`
  - `framework-selection`
  - `langchain-dependencies`
  - `langchain-fundamentals`
  - `langchain-middleware`
  - `langchain-rag`
  - `langgraph-fundamentals`
  - `langgraph-persistence`
  - `langgraph-human-in-the-loop`
  - `deep-agents-core`
  - `deep-agents-memory`
  - `deep-agents-orchestration`
- `src/experiments/`: Experiment scripts
  - `local-shell.ts` — `LocalShellBackend` demo
  - `tools-stream.ts` — `streamMode: "tools"` demo
  - `standard-schema.ts` — Zod v4 + `withStructuredOutput` demo
  - `skill-queries.ts` — Skill queries demo
  - `remaining-skill-queries.ts` — Additional skill queries demo

### Changed

- `.gitignore`: Add `docs/*`
- `@langchain/core`: ^1.1.20 → ^1.1.31
- `@langchain/langgraph`: ^1.1.4 → ^1.2.1
- `@langchain/openai`: ^1.2.6 → ^1.2.12
- `deepagents`: ^1.7.3 → ^1.8.1
- Added `langchain`: ^1.2.30

## [1.0.0] - 2026-02-15

### Added

- Initial release of LangGraph.JS Skills test environment
- `src/index.ts`: Main entry point using `createDeepAgent` with `FilesystemBackend`
- `src/index-with-claude-tools.ts`: Alternative entry with manual skill loading via recursive scan
- `skills/arxiv-search/`: arXiv paper search skill with CLI tool
- `skills/langgraph-docs/`: LangGraph documentation skill
- npm scripts: `start`, `dev`, `start:claude`, `start:skills`, `start:graph`
- `.env.example` for environment variable configuration

### Dependencies

- `@langchain/core` ^1.1.31 — Zod v4 / Standard Schema support
- `@langchain/langgraph` ^1.2.1 — `tools` stream mode
- `@langchain/openai` ^1.2.12 — OpenAI GPT-4o integration
- `deepagents` ^1.8.1 — Skills framework with `LocalShellBackend`
- `zod` ^4.3.6 — Schema validation
- `dotenv` ^16.4.7 — Environment variable management
