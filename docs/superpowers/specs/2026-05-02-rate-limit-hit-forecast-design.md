# Rate-Limit Hit Forecast Design

Date: 2026-05-02
Status: Proposed

## Summary

Replace the current rolling `%/m` burn-rate display in the subscriber `5h` and
`7d` rate-limit modules with a forecasted breach time. The new forecast should
answer the more useful question: if recent usage continues at roughly the same
15-minute pace, will the window hit 100% before reset, and if so, when?

Example output:

```text
5h 55% (+10%, hit in 45m) (3h 10m)
7d 61% (+8%, hit in 2d 4h) (Sun 8:00 PM)
```

If the recent trend does not project exhausting the current window before
reset, the module should continue showing only the pace variance and the
existing trailing reset display.

## Goals

- Keep the current pace-gap signal such as `+10%`.
- Replace the `%/m` metric with a simpler forecast: `hit in ...`.
- Show the forecast only when recent pace would exhaust the window before
  `resets_at`.
- Reuse the same short rolling history and persistence model already added for
  rate-limit tracking.

## Non-Goals

- Changing the persistence path or retention window.
- Repeating the reset time inside the variance segment.
- Predicting recovery or convergence back to the ideal pace when no breach is
  projected.

## Current State

The status line currently persists 15 minutes of subscriber rate-limit samples
in the user config directory and computes a rolling burn rate from those
samples. The modules render that value inline:

```text
5h 55% (+10%, +0.3%/m) (3h 10m)
```

That output can be misread as raw usage growth instead of what the user
actually wants to know: whether the current trend will run out before reset.

## Proposed Design

### Forecast Calculation

Continue using the existing 15-minute rolling sample history.

For each active rate-limit window:

1. Append the latest sample.
2. Prune stale samples and samples from previous `resets_at` windows.
3. If fewer than two samples remain, return no forecast.
4. Compute the rolling burn rate from oldest to newest sample:

```text
(newest.used_percentage - oldest.used_percentage) / elapsed_minutes
```

5. If the burn rate is zero or negative, return no forecast.
6. Compute the minutes to reach `100%` from the current usage:

```text
(100 - current.used_percentage) / burn_rate
```

7. Convert that projected hit time to Unix seconds and only keep it when the
   result is strictly before `resets_at`.

### Rendering

Keep the current pace variance and trailing reset display, but replace the
burn-rate segment with a breach forecast:

```text
<label> <used%> (<pace variance>, hit in <duration>) (<reset display>)
```

Examples:

```text
5h 55% (+10%, hit in 45m) (3h 10m)
7d 61% (+8%, hit in 2d 4h) (Sun 8:00 PM)
5h 42% (+3%) (2h 20m)
```

Rendering rules:

- Keep the current variance color treatment.
- Show `hit in ...` only when the projection would hit 100% before reset.
- Hide the forecast when:
  - there is insufficient history
  - the burn rate is flat or negative
  - the projected hit time is at or after `resets_at`
- Render the forecast in relative time, not an absolute timestamp.

### Reset Display

Do not duplicate reset information inside the variance segment. The existing
trailing reset display already provides the comparison point:

```text
5h 55% (+10%, hit in 45m) (3h 10m)
```

This keeps the module compact while still letting the user compare projected hit
time against the reset window at a glance.

### Failure Handling

The forecast must inherit the same persistence safety guarantees as the current
history implementation:

- invalid or missing history files are treated as empty history
- persistence failures do not break the status line
- window rollover via `resets_at` starts a fresh history automatically

## Implementation Shape

### `src/rate_limit_history.ts`

- keep the persisted sample model as-is
- replace or supplement `computeBurnRate()` with a helper that computes an
  optional projected hit timestamp or relative duration
- keep the helper pure and based on the in-memory rolling sample set

### `src/limits.ts`

- replace the optional burn-rate parameter with an optional `timeToHitSeconds`
- format `hit in ${formatDuration(timeToHitSeconds * 1000)}`
- keep the current pace variance math and reset display behavior

### `src/main.ts`

- keep loading and saving the same history file
- compute an optional projected breach for `five_hour` and `seven_day`
- pass that forecast into the rate-limit formatter

## Testing

Add or update tests for:

- forecast shown when a positive trend reaches 100% before reset
- forecast hidden when burn is flat or negative
- forecast hidden when projected hit lands after reset
- relative `hit in ...` rendering for both short and longer durations
- preserving the current `(+delta%)` rendering when no forecast exists

## Open Questions

None. The approved decisions are:

- use relative time like `hit in 45m`
- only show the forecast when the projected breach is inside the reset window
- keep the existing trailing reset display rather than repeating reset inline
