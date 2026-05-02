# Rate-Limit Burn Rate Design

Date: 2026-05-02
Status: Proposed

## Summary

Add a persisted burn-rate indicator for the subscriber `5h` and `7d` rate-limit
modules in the Claude status line. The status line should record recent
rate-limit usage samples to a user-level config file, compute a rolling burn
rate from the last 15 minutes of samples, and render that rate inline next to
the existing pace variance.

Example output:

```text
5h 24% (+13%, +5%/m) (20m)
7d 39% (-3%, +0.4%/m) (Sun 8:00 AM)
```

If there is not yet enough recent history to compute the burn rate, the status
line should continue showing the existing variance and reset time without a
burn-rate segment.

## Goals

- Persist lightweight recent usage history for subscriber rate-limit windows.
- Compute a rolling `%/m` burn rate from samples collected within the last
  15 minutes.
- Show the burn rate inline in the `session` (`5h`) and `week` (`7d`) modules.
- Keep the history file tiny and self-pruning.
- Recover gracefully from missing or malformed history state.

## Non-Goals

- Tracking non-subscriber usage sources such as context-window usage, token
  counts, or session cost.
- Adding new CLI flags or user configuration for retention length in this
  change.
- Persisting long-term analytics or building a queryable usage database.

## Current State

The status line already renders subscriber rate-limit modules when Claude Code
provides `rate_limits.five_hour` and `rate_limits.seven_day` in stdin. Each
module currently shows:

- the window label (`5h` or `7d`)
- the current `used_percentage`
- the linear pace variance relative to the current reset window
- the reset time display

The current implementation is stateless. It derives pace variance from the
current window metadata only and does not persist any historical samples across
status-line executions.

## Proposed Design

### Persistence Location

Store rate-limit history in the user's config directory so the data is scoped
to the machine/user rather than to any single repository.

Target path:

```text
<user-config-dir>/claude-status-line/rate-limit-history.json
```

The implementation should resolve the config root using Deno APIs and create the
parent directory on demand.

### Data Model

Persist a single JSON document containing independent histories for each
subscriber window.

```json
{
  "five_hour": [
    {
      "timestamp": 1777708800,
      "used_percentage": 24,
      "resets_at": 1777723200
    }
  ],
  "seven_day": [
    {
      "timestamp": 1777708800,
      "used_percentage": 39,
      "resets_at": 1778304000
    }
  ]
}
```

Each sample stores:

- `timestamp`: Unix seconds when the status line observed the window
- `used_percentage`: reported rate-limit usage at that moment
- `resets_at`: the reset boundary for the active Claude window

### Retention and Pruning

The status line should prune aggressively on every execution to keep the file
small and bounded:

- remove samples older than 15 minutes from `now`
- remove samples whose `resets_at` no longer matches the current active window
- keep only windows that are currently supported by the persisted schema

This keeps the file naturally small because each list only ever contains recent
samples from the active Claude window.

### Burn-Rate Calculation

Burn rate should be computed independently for `five_hour` and `seven_day`
using only samples inside the last 15 minutes.

Algorithm:

1. Append the latest sample for the active window.
2. Prune stale or mismatched samples.
3. If fewer than two samples remain, return no burn rate.
4. Use the oldest and newest remaining samples to compute:

```text
(newest.used_percentage - oldest.used_percentage) / elapsed_minutes
```

5. If elapsed time is zero or effectively unusable, return no burn rate.

Using oldest-to-newest samples makes the output stable and easy to reason
about, while still reflecting recent pace over the configured 15-minute window.

### Window Reset Handling

Claude rate-limit windows are identified by `resets_at`. When the current
window's `resets_at` differs from persisted samples, the status line should
discard older samples for that window and start a fresh history. This prevents
burn-rate contamination across window boundaries.

### Rendering

Keep the existing pace variance behavior and append burn rate inside the same
parenthetical group.

Format:

```text
<label> <used%> (<pace variance>, <burn rate>/m) (<reset display>)
```

Examples:

```text
5h 24% (+13%, +5%/m) (20m)
7d 39% (-3%, +0.4%/m) (Sun 8:00 AM)
5h 24% (+13%) (20m)
```

Rendering rules:

- Preserve the current variance calculation and color treatment.
- Append burn rate only when enough recent data exists.
- Show positive, zero, or negative rates honestly.
- Round burn rates for readability:
  - whole numbers when absolute value is at least `1`
  - one decimal place when absolute value is below `1`

Expected examples:

- `+5%/m`
- `+0.4%/m`
- `+0%/m`
- `-1%/m`

### Failure Handling

History persistence must never break the status line.

If the history file is missing, unreadable, or malformed:

- treat history as empty
- continue rendering the rest of the status line
- overwrite the file on the next successful save

If the config directory cannot be created or the file cannot be written:

- skip persistence for that invocation
- continue rendering using whatever in-memory information is available

## Implementation Plan Shape

### New Module

Add a dedicated module such as `src/rate_limit_history.ts` to own:

- config-path resolution
- history load and save
- sample pruning
- window reset handling
- rolling burn-rate calculation

This keeps persistence logic out of `src/main.ts` and keeps formatting logic out
of the persistence layer.

### Updates to Existing Modules

`src/main.ts`

- load rate-limit history once during startup
- record current `five_hour` and `seven_day` samples when present
- compute burn rates for each window
- persist the pruned history back to disk
- pass burn-rate data into module formatting

`src/limits.ts`

- extend the rate-limit formatter to accept an optional burn-rate value
- render the combined variance and burn-rate segment when available
- preserve current reset-time and ANSI emphasis behavior

`src/types.ts`

- add local interfaces for the persisted history model if they belong in shared
  types; otherwise keep them local to the new history module

## Testing

Add coverage for:

- pruning samples older than 15 minutes
- resetting history when `resets_at` changes
- burn-rate calculation from multiple samples
- hiding burn rate when insufficient history exists
- rendering whole-number and decimal burn rates
- graceful recovery from missing or malformed persisted history

Likely test locations:

- `tests/limits_test.ts` for rendering behavior
- a new `tests/rate_limit_history_test.ts` for persistence and calculation logic

## Risks and Mitigations

- File-write overhead on every render:
  keep the payload tiny and prune on each write.
- Noisy output when samples are sparse:
  hide burn rate until at least two valid samples exist.
- Window rollover contamination:
  reset history whenever `resets_at` changes.
- Bad local state causing failures:
  treat all persistence problems as non-fatal.

## Open Questions

None. The following decisions were confirmed during brainstorming:

- persist history in the user's config directory
- compute burn rate from the last 15 minutes only
- show burn rate inline next to pace variance
- hide burn rate until enough history exists
