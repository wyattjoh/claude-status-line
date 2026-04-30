# Percentage Color Emphasis Design

## Summary

Add built-in ANSI color emphasis for percentage values in the status line so percentage-bearing modules are easier to scan. The change is intentionally narrow: only the percentage token itself is styled, and only within the existing `cache`, `context`, `session`, and `week` modules.

## Goals

- Make percentage values easier to identify in the status line.
- Keep the implementation lightweight and zero-config.
- Preserve existing text structure and module ordering.
- Avoid introducing a general theming or per-module color configuration system in this change.

## Non-Goals

- No user-configurable themes, palettes, or per-module styling.
- No Powerline-style rendering or background color support.
- No new formatting behavior for non-percentage modules such as `model`, `cost`, `git`, `dir`, or `weather`.
- No severity-based coloring that changes based on the numeric percentage.

## Scope

The change applies only to these modules:

- `cache`
- `context`
- `session`
- `week`

The percentage token in each of those modules will render in white when terminal color output is enabled. Other text in the same module remains unchanged.

Examples:

- `⚡ 87%`
- `🧠 5% (51K/1M)`
- `5h 98% (20m)`
- `7d 39% (Sun 8:00 AM)`

In those examples, only `87%`, `5%`, `98%`, and `39%` receive color styling.

## Rendering Rules

The status line should continue to be assembled from plain text segments, but percentage tokens in the scoped modules will be wrapped in ANSI escape sequences for white foreground text.

Rules:

- Apply styling only to the percentage token.
- Leave surrounding icons, labels, parentheses, reset-time text, and count details unstyled.
- Keep separators unstyled.
- Preserve the exact visible text content of each module aside from ANSI escape sequences.
- Use explicit reset codes after the styled token so formatting does not leak into later text.

## Compatibility

Color output should be enabled only when the output stream appears color-capable.

Rules:

- Do not emit color when `NO_COLOR` is present in the environment.
- Do not emit color when stdout is not a TTY.
- When color is disabled, output must match current plain-text behavior exactly.

This keeps the feature safe for terminals, logs, snapshots, and tooling that expect plain output.

## Implementation Approach

Add a small internal formatting helper instead of introducing a full dependency or a reusable theme engine.

Expected implementation shape:

- Add a helper that wraps text with ANSI foreground color and reset sequences.
- Add a helper dedicated to rendering percentage-bearing module strings so only the percentage token is styled.
- Update the `cache`, `context`, `session`, and `week` module render paths in `src/main.ts` to use the helper.
- Keep formatting logic local and simple rather than introducing a large styling abstraction.

## Testing

Add tests that verify:

- Scoped percentage modules emit ANSI styling around only the percentage token when color is enabled.
- The percentage token reset is applied so following text remains unstyled.
- Non-percentage modules remain unchanged.
- The same modules render plain text when color is disabled.
- Existing module parsing behavior is unaffected.

## Risks and Mitigations

ANSI styling can interfere with tests or consumers that compare raw strings.

Mitigations:

- Gate color output behind terminal capability checks.
- Keep a plain-text path that preserves current output.
- Assert exact strings in tests for both colored and non-colored modes.

## Open Decisions Resolved

- Percentage values should be white, not severity-colored.
- Only percentage-bearing modules are included in this change.
- This work should remain built-in and zero-config.
