# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript/Deno-based status line for Claude Code that displays project information, git branch, model details, session cost, context token usage, and directory information. The status line receives Claude Code context as JSON through stdin and outputs a formatted status line.

## Development Commands

- `deno check` - Type checking
- `deno fmt` - Format code (uses 2-space indentation, semicolons, double quotes)
- `deno lint` - Lint code
- `deno publish --dry-run --allow-dirty` - Test publishing

## Project Structure

- `src/main.ts` - Entry point that reads Claude context from stdin and builds status line
- `src/types.ts` - TypeScript interfaces for Claude context structure
- `src/git.ts` - Git repository information extraction using child_process
- `src/currency.ts` - Currency conversion with caching for session cost display

## Architecture

The application follows a functional architecture:

1. **Input Processing**: Reads JSON context from stdin containing session_id, transcript_path, model info, and workspace details
2. **Component Generation**: Builds status line components with emojis:
   - 📁 Project name (if different from current directory)
   - 🤖 Model name
   - 💰 Session cost in CAD (fetched from ccusage)
   - 📈 Context token percentage
   - 📂 Current directory basename
   - 🌿 Git branch (if in repository)
3. **Output**: Joins components with " | " separator

## Key Dependencies

- `ccusage` (npm package) - For Claude session usage tracking and cost calculation
- Built-in Deno APIs for file system, process, and networking

## Error Handling

- All external command executions (git) are wrapped in try-catch with graceful fallbacks
- Currency conversion failures fall back to USD display
- Missing git repositories or branches result in empty components

## Testing and Quality

Run formatting and linting after any changes:

```bash
deno fmt && deno lint
```

The project has strict TypeScript configuration with exactOptionalPropertyTypes enabled.
