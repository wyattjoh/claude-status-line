# Claude Code Status Line

A TypeScript/Deno-based status line for Claude Code that displays project information, git branch, model details, and session time remaining.

## Features

- 🤖 **Model Display**: Shows the current Claude model being used
- 📁 **Project Info**: Displays project name and current directory
- 🌿 **Git Integration**: Shows current git branch when in a repository
- ⏰ **Session Timer**: Tracks remaining time in your 5-hour Claude session
- 🎨 **Clean Icons**: Uses emojis for visual clarity

## Installation

Add this to your `.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "deno run --allow-read --allow-run --allow-env jsr:@wyattjoh/claude-status-line"
  }
}
```

## Development

### Prerequisites

- Deno 1.40+
- Access to Claude Code configuration files

### Available Tasks

```bash
deno check  # Type checking
deno fmt    # Format code
deno lint   # Lint code
```

### How It Works

The status line receives Claude Code context as JSON through stdin:

```typescript
interface ClaudeContext {
  session_id: string;
  transcript_path: string;
  model: {
    id: string;
    display_name: string;
  };
  workspace: {
    current_dir: string;
    project_dir: string;
  };
}
```

It then builds a status line showing:

- Project name (if different from current directory)
- Model name with robot emoji
- Session time remaining (parsed from Claude usage logs)
- Current directory with folder emoji
- Git branch with branch emoji

### Session Tracking

The status line tracks your Claude session time by:

1. Reading JSONL usage files from `~/.claude/projects/` directories
2. Parsing today's entries to identify active sessions
3. Calculating remaining time from a 5-hour session limit
4. Displaying time in human-readable format (e.g., "2h 30m left")

### Example Output

```
📁 my-project | 🤖 Claude 3.5 Sonnet | ⏰ 3h 45m left | 📂 src | 🌿 feature-branch
```

## Configuration

### Customizing Icons

Edit the emoji icons in `src/main.ts`:

```typescript
components.push(`🤖 ${modelName}`); // Model
components.push(`📁 ${projectName}`); // Project
components.push(`📂 ${dirName}`); // Directory
components.push(`🌿 ${branch}`); // Git branch
components.push(`⏰ ${timeLeft}`); // Session time
```

### Adjusting Session Duration

The default session duration is 5 hours. To change it, modify:

```typescript
const SESSION_DURATION_MS = 5 * 60 * 60 * 1000; // 5 hours
```

## Troubleshooting

### Git Branch Not Showing

- Ensure you're in a git repository
- Check that `git` command is available in PATH
- Verify git repository is properly initialized

### Session Time Not Displaying

- Check that Claude usage logs exist in `~/.claude/projects/`
- Ensure the script has read permissions to Claude directories
- Verify JSONL files contain recent usage data

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run the development tasks to ensure code quality
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Related

- [Claude Code Documentation](https://docs.anthropic.com/en/docs/claude-code)
- [Claude Code Status Line Guide](https://docs.anthropic.com/en/docs/claude-code/statusline)
- [Deno Documentation](https://deno.land/manual)
- Forked from https://github.com/nmwagencia/reimagined-journey
