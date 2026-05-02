# Claude Code Status Line

A TypeScript/Deno-based status line for Claude Code that displays project information, git branch, model details, session cost, and context token usage.

## Features

- 🤖 **Model Display**: Shows current Claude model (or multiple if used)
- 📁 **Project Info**: Displays project name and current directory
- 🌿 **Git Integration**: Shows current git branch when in a repository
- 💰 **Session Cost**: Displays current session cost in selected currency
- 📊 **Token Usage**: Shows input/output token counts
- ⚡ **Cache Efficiency**: Shows percentage of tokens served from cache
- 🧠 **Context Usage**: Shows context token percentage with limits
- 🎨 **Percentage Emphasis**: Always renders percentage values in white for `cache`, `context`, `session`, and `week`
- 📈 **Pace Variance**: `session` and `week` show how far ahead or behind the linear-interpolation pace you are (e.g. `(+10%)` red when over pace, dim when on or under)
- 🔥 **Hit Forecast**: `session` and `week` can append a rolling 15-minute `hit in ...` forecast when the recent trend would exhaust the window before reset
- ⏱️ **Session Duration**: Shows how long the session has been active
- 📝 **Lines Changed**: Shows lines added/removed during session
- 🌤️ **Weather**: Shows current weather for a configured location

## Installation

Add this to your `.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "deno run --allow-net --allow-env --allow-read --allow-write --allow-run --allow-sys jsr:@wyattjoh/claude-status-line"
  }
}
```

### Customization

#### Currency

You can customize the currency used for session cost display by adding the `--currency` flag:

```json
{
  "statusLine": {
    "type": "command",
    "command": "deno run --allow-net --allow-env --allow-read --allow-write --allow-run --allow-sys jsr:@wyattjoh/claude-status-line --currency USD"
  }
}
```

Supported currencies include: USD, EUR, GBP, JPY, AUD, and many others. Defaults to CAD.

#### Modules

You can selectively enable status line modules using the `--modules` / `-m` flag with a comma-separated list of module names. When omitted, all modules are shown.

```json
{
  "statusLine": {
    "type": "command",
    "command": "deno run --allow-net --allow-env --allow-read --allow-write --allow-run --allow-sys jsr:@wyattjoh/claude-status-line --modules model,cost,context,git"
  }
}
```

Available modules:

| Module     | Emoji | Description                                  |
| ---------- | ----- | -------------------------------------------- |
| `project`  | 📁    | Project directory name                       |
| `model`    | 🤖    | AI model name                                |
| `cost`     | 💰    | Session cost                                 |
| `tokens`   | 📊    | Input/output token counts                    |
| `cache`    | ⚡    | Cache efficiency %                           |
| `context`  | 🧠    | Context token usage                          |
| `session`  | 5h    | 5-hour session rate-limit usage (subscriber) |
| `week`     | 7d    | 7-day rate-limit usage (subscriber)          |
| `duration` | ⏱️    | Session duration                             |
| `lines`    | +/-   | Lines added/removed                          |
| `dir`      | 📂    | Current directory                            |
| `git`      | 🌿    | Git branch                                   |
| `weather`  | icon  | Weather info (requires --location)           |

`session` and `week` only appear when Claude Code includes the
subscriber-only `rate_limits` field in stdin.

The percentage value inside `cache`, `context`, `session`, and `week` is always
emphasized in white using ANSI escape sequences, and the rendered status line
is prefixed with an ANSI reset so Claude Code's dim styling does not mute the
effect.

`session` and `week` also include a pace-variance indicator. The window's
expected usage is computed by linear interpolation from the start of the
window (`resets_at` minus the window length) to `resets_at`. The difference
between actual `used_percentage` and that expected value is shown in
parentheses, e.g. `5h 24% (+10%) (20m)`. Positive deltas (over pace) render in
red; zero or negative deltas (on or under pace) render dim.

When enough local history exists, `session` and `week` can also append a
forecast sourced from the same small user-config history file, e.g.
`5h 55% (+10%, hit in 45m) (3h 10m)`. The forecast is hidden unless the recent
trend would exhaust the current window before reset.

## Development

### Prerequisites

- Deno 2.x
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
  context_window:
    | {
      total_input_tokens: number;
      total_output_tokens?: number;
      context_window_size: number;
      used_percentage?: number;
      remaining_percentage?: number;
    }
    | undefined;
  rate_limits?: {
    five_hour?: {
      used_percentage: number;
      resets_at: number;
    };
    seven_day?: {
      used_percentage: number;
      resets_at: number;
    };
  };
}
```

It then builds a status line showing:

- Project name (if different from current directory)
- Model name (or multiple models if used in session)
- Session cost in desired currency with currency code
- Input/output token counts
- Cache efficiency percentage
- Context token usage with current/limit counts
- Current 5-hour session rate-limit usage when available to subscribers
- Current 7-day rate-limit usage when available to subscribers
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
🤖 Opus 4.6 | 💰 $5.12 CAD | 📊 984/8.3K | ⚡ 100% | 🧠 5% (51K/1M) | 5h 98% (+15%, hit in 20m) (25m) | 7d 39% (-3%) (Sun 8:00 AM) | ⏱️ 5m | +150/-30 | 📂 my-project | 🌿 main
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
