# Claude Code Status Line

A TypeScript/Deno-based status line for Claude Code that displays project information, git branch, model details, session cost, and context token usage.

## Features

- 🤖 **Model Display**: Shows current Claude model (or multiple if used)
- 📁 **Project Info**: Displays project name and current directory
- 🌿 **Git Integration**: Shows current git branch when in a repository
- 💰 **Session Cost**: Displays current session cost in selected currency
- 📊 **Token Usage**: Shows input/output token counts
- ⚡ **Cache Efficiency**: Shows percentage of tokens served from cache
- 📈 **Context Usage**: Shows context token percentage with limits
- ⏱️ **Session Duration**: Shows how long the session has been active
- 📝 **Lines Changed**: Shows lines added/removed during session

## Installation

Add this to your `.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "deno run --allow-net --allow-env --allow-read --allow-write --allow-run --allow-sys jsr:@wyattjoh/claude-status-line@0.4.0"
  }
}
```

### Customization

You can customize the currency used for session cost display by adding the `--currency` flag:

```json
{
  "statusLine": {
    "type": "command",
    "command": "deno run --allow-net --allow-env --allow-read --allow-write --allow-run --allow-sys jsr:@wyattjoh/claude-status-line@0.3.0 --currency USD"
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
  cost:
    | {
      total_cost_usd: number;
      total_duration_ms: number;
      total_api_duration_ms: number;
      total_lines_added: number;
      total_lines_removed: number;
    }
    | undefined;
}
```

It then builds a status line showing:

- Project name (if different from current directory)
- Model name (or multiple models if used in session)
- Session cost in desired currency with currency code
- Input/output token counts
- Cache efficiency percentage
- Context token usage with current/limit counts
- Session duration
- Lines added/removed
- Current directory
- Git branch

### Usage Tracking

The status line tracks your Claude usage by:

1. Loading session usage data using the ccusage library
2. Calculating session cost and displaying in configured currency
3. Computing context token usage percentage from transcript files
4. Displaying real-time cost and context information

### Example Output

```
🤖 Opus 4.5 | 💰 $5.12 CAD | 📊 984/8.3K | ⚡ 100% | 📈 26% (51K/200K) | ⏱️ 5m | +150/-30 | 📂 my-project | 🌿 main
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
