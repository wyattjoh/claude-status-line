# Claude Code Status Line

A TypeScript/Deno-based status line for Claude Code that displays project information, git branch, model details, session cost, and context token usage.

## Features

- 🤖 **Model Display**: Shows the current Claude model being used
- 📁 **Project Info**: Displays project name and current directory
- 🌿 **Git Integration**: Shows current git branch when in a repository
- 💰 **Session Cost**: Displays current session cost in selected currency
- 📈 **Context Usage**: Shows context token percentage
- 🎨 **Clean Icons**: Uses emojis for visual clarity

## Installation

Add this to your `.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "deno run --allow-net --allow-env --allow-read --allow-write --allow-run --allow-sys jsr:@wyattjoh/claude-status-line@0.1.0"
  }
}
```

### Customization

You can customize the currency used for session cost display by adding the `--currency` flag:

```json
{
  "statusLine": {
    "type": "command",
    "command": "deno run --allow-net --allow-env --allow-read --allow-write --allow-run --allow-sys jsr:@wyattjoh/claude-status-line@0.1.0 --currency USD"
  }
}
```

Supported currencies include: USD, EUR, GBP, JPY, AUD, and many others. Defaults to CAD.

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
- Session cost in desired currency (fetched from ccusage)
- Context token usage percentage
- Current directory with folder emoji
- Git branch with branch emoji

### Usage Tracking

The status line tracks your Claude usage by:

1. Loading session usage data using the ccusage library
2. Calculating session cost and displaying in configured currency
3. Computing context token usage percentage from transcript files
4. Displaying real-time cost and context information

### Example Output

```
📁 my-project | 🤖 Claude 3.5 Sonnet | 💰 $0.45 session | 📈 67% | 📂 src | 🌿 feature-branch
```

## Troubleshooting

### Git Branch Not Showing

- Ensure you're in a git repository
- Check that `git` command is available in PATH
- Verify git repository is properly initialized

### Session Cost Not Displaying

- Ensure the ccusage library can access Claude usage data
- Check that the session ID is valid and usage data exists
- Verify network access for currency conversion

### Context Percentage Not Showing

- Ensure the transcript path is accessible
- Check that the transcript file contains valid data
- Verify file read permissions for the transcript directory

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
- Uses currency data provided at https://github.com/fawazahmed0/exchange-api
