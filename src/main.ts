import { basename } from "node:path";
import process from "node:process";
import { Buffer } from "node:buffer";
import { Command } from "@cliffy/command";

import { formatCurrency } from "./currency.ts";
import {
  calculateCacheEfficiency,
  formatCompactNumber,
  formatDuration,
  packComponentsIntoLines,
  prepareStatusLineOutput,
  shortenModelName,
} from "./format.ts";
import { getGitInfo } from "./git.ts";
import { getTerminalWidth } from "./terminal.ts";
import {
  FIVE_HOURS_IN_SECONDS,
  formatRateLimitModule,
  SEVEN_DAYS_IN_SECONDS,
} from "./limits.ts";
import {
  loadContextTokensFromTranscript,
  loadSessionMetrics,
} from "./session.ts";
import {
  BURN_RATE_WINDOW_FIVE_HOUR_SECONDS,
  BURN_RATE_WINDOW_SEVEN_DAY_SECONDS,
  compactSamples,
  computeTimeToHitSeconds,
  createEmptyRateLimitHistory,
  getDefaultRateLimitHistoryPath,
  loadRateLimitHistory,
  makeWeekTieredBucketKey,
  minuteBucketKey,
  pruneWindowSamples,
  RATE_LIMIT_HISTORY_RETENTION_FIVE_HOUR_SECONDS,
  RATE_LIMIT_HISTORY_RETENTION_SEVEN_DAY_SECONDS,
  saveRateLimitHistory,
  updateWindowSamples,
} from "./rate_limit_history.ts";
import {
  ALL_MODULES,
  formatCacheModule,
  formatContextModule,
  type Module,
  parseModules,
} from "./status_modules.ts";
import type { ClaudeContext } from "./types.ts";
import { getWeather } from "./weather.ts";

export { ALL_MODULES, formatCacheModule, formatContextModule, parseModules };

function parseClaudeContext(input: string): ClaudeContext {
  try {
    return JSON.parse(input) as ClaudeContext;
  } catch {
    throw new Error("Invalid JSON input from Claude Code");
  }
}

async function timed<T>(
  work: () => Promise<T>,
): Promise<readonly [T, number]> {
  const start = performance.now();
  const value = await work();
  return [value, performance.now() - start] as const;
}

function cacheIcon(ms: number): string {
  if (ms < 5) return "🔥";
  if (ms < 50) return "🌡️";
  return "🧊";
}

interface BuildOptions {
  currency: string;
  location: string | undefined;
  modules: Set<Module> | undefined;
}

async function buildStatusLine(options: BuildOptions): Promise<void> {
  const startedAtMs = performance.now();
  const show = (name: Module) => !options.modules || options.modules.has(name);

  if (options.location && !show("weather")) {
    throw new Error(
      "--location is set but the 'weather' module is not enabled. " +
        "Add 'weather' to --modules or remove --location.",
    );
  }

  // Read Claude Code context from stdin
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks).toString();

  const {
    session_id: sessionID,
    transcript_path: transcriptPath,
    model: { id: modelID, display_name: modelName },
    workspace: { current_dir: currentDir, project_dir: projectDir },
    cost,
    context_window: contextWindow,
    rate_limits: rateLimits,
  } = parseClaudeContext(input);
  const nowUnixSeconds = Math.floor(Date.now() / 1000);
  const rateLimitHistoryPath = getDefaultRateLimitHistoryPath();

  // Session metrics requires scanning the transcript via ccusage (~115ms +
  // ~65ms cold-import cost). Skip it when no displayed module depends on it.
  const needSessionMetrics = show("tokens") ||
    show("cache") ||
    (show("cost") && !cost);
  const needRateLimits = show("session") || show("week");
  const needGit = show("git");
  const needWeather = options.location !== undefined && show("weather");

  // Load async data in parallel for better performance
  const [
    [sessionMetrics, sessionMetricsMs],
    [contextTokens, contextTokensMs],
    [gitInfo, gitInfoMs],
    [weatherInfo, weatherInfoMs],
    [rateLimitHistory, rateLimitHistoryMs],
  ] = await Promise
    .all([
      timed(() =>
        needSessionMetrics
          ? loadSessionMetrics(sessionID)
          : Promise.resolve(undefined)
      ),
      timed(() =>
        contextWindow
          ? Promise.resolve({
            inputTokens: contextWindow.used_percentage != null
              ? Math.round(
                (contextWindow.used_percentage / 100) *
                  contextWindow.context_window_size,
              )
              : contextWindow.total_input_tokens,
            percentage: contextWindow.used_percentage ??
              Math.round(
                (contextWindow.total_input_tokens /
                  contextWindow.context_window_size) * 100,
              ),
            contextLimit: contextWindow.context_window_size,
          })
          : loadContextTokensFromTranscript(transcriptPath, modelID)
      ),
      timed(() => needGit ? getGitInfo(currentDir) : Promise.resolve(null)),
      timed(() =>
        needWeather && options.location
          ? getWeather(options.location)
          : Promise.resolve(null)
      ),
      timed(() =>
        needRateLimits && rateLimitHistoryPath
          ? loadRateLimitHistory(rateLimitHistoryPath)
          : Promise.resolve(createEmptyRateLimitHistory())
      ),
    ]);

  const sevenDayBucketKey = makeWeekTieredBucketKey(nowUnixSeconds);
  const nextRateLimitHistory = needRateLimits
    ? {
      five_hour: rateLimits?.five_hour
        ? updateWindowSamples(
          rateLimitHistory.five_hour,
          {
            timestamp: nowUnixSeconds,
            used_percentage: rateLimits.five_hour.used_percentage,
            resets_at: rateLimits.five_hour.resets_at,
          },
          nowUnixSeconds,
          RATE_LIMIT_HISTORY_RETENTION_FIVE_HOUR_SECONDS,
          minuteBucketKey,
        )
        : compactSamples(
          pruneWindowSamples(rateLimitHistory.five_hour, {
            nowUnixSeconds,
            retentionSeconds: RATE_LIMIT_HISTORY_RETENTION_FIVE_HOUR_SECONDS,
          }),
          minuteBucketKey,
        ),
      seven_day: rateLimits?.seven_day
        ? updateWindowSamples(
          rateLimitHistory.seven_day,
          {
            timestamp: nowUnixSeconds,
            used_percentage: rateLimits.seven_day.used_percentage,
            resets_at: rateLimits.seven_day.resets_at,
          },
          nowUnixSeconds,
          RATE_LIMIT_HISTORY_RETENTION_SEVEN_DAY_SECONDS,
          sevenDayBucketKey,
        )
        : compactSamples(
          pruneWindowSamples(rateLimitHistory.seven_day, {
            nowUnixSeconds,
            retentionSeconds: RATE_LIMIT_HISTORY_RETENTION_SEVEN_DAY_SECONDS,
          }),
          sevenDayBucketKey,
        ),
    }
    : rateLimitHistory;
  const fiveHourTimeToHitSeconds = needRateLimits && rateLimits?.five_hour
    ? computeTimeToHitSeconds(
      nextRateLimitHistory.five_hour,
      nowUnixSeconds,
      BURN_RATE_WINDOW_FIVE_HOUR_SECONDS,
    )
    : undefined;
  const sevenDayTimeToHitSeconds = needRateLimits && rateLimits?.seven_day
    ? computeTimeToHitSeconds(
      nextRateLimitHistory.seven_day,
      nowUnixSeconds,
      BURN_RATE_WINDOW_SEVEN_DAY_SECONDS,
    )
    : undefined;

  if (needRateLimits && rateLimitHistoryPath) {
    try {
      await saveRateLimitHistory(rateLimitHistoryPath, nextRateLimitHistory);
    } catch {
      // Persistence is best-effort and must not break the status line.
    }
  }

  // Build status line components with icons and separators
  const components: string[] = [];
  const debugActive = show("debug");
  const decorate = (ms: number, content: string) =>
    debugActive ? `${cacheIcon(ms)} ${content}` : content;

  // Get project name if available
  if (show("project") && projectDir && projectDir !== currentDir) {
    components.push(decorate(0, `📁 ${basename(projectDir)}`));
  }

  // Add AI model with icon - show multiple models if used
  if (show("model")) {
    if (sessionMetrics && sessionMetrics.modelsUsed.length > 1) {
      const shortNames = sessionMetrics.modelsUsed.map(shortenModelName);
      components.push(
        decorate(sessionMetricsMs, `🤖 ${shortNames.join("+")}`),
      );
    } else {
      components.push(decorate(0, `🤖 ${modelName}`));
    }
  }

  // Add session cost with currency code
  if (show("cost")) {
    let display: string | null = null;
    let costMs = 0;
    if (cost) {
      const [value, ms] = await timed(() =>
        formatCurrency(cost.total_cost_usd, options.currency)
      );
      display = value;
      costMs = ms;
    } else if (sessionMetrics) {
      const [value, ms] = await timed(() =>
        formatCurrency(sessionMetrics.totalCost, options.currency)
      );
      display = value;
      costMs = ms + sessionMetricsMs;
    }
    if (display !== null) {
      components.push(decorate(costMs, `💰 ${display} ${options.currency}`));
    }
  }

  // Add token counts (input/output)
  if (show("tokens") && sessionMetrics) {
    const inputDisplay = formatCompactNumber(sessionMetrics.inputTokens);
    const outputDisplay = formatCompactNumber(sessionMetrics.outputTokens);
    components.push(
      decorate(sessionMetricsMs, `📊 ${inputDisplay}/${outputDisplay}`),
    );
  }

  // Add cache efficiency
  if (show("cache") && sessionMetrics) {
    const efficiency = calculateCacheEfficiency(
      sessionMetrics.cacheReadTokens,
      sessionMetrics.inputTokens,
    );
    components.push(decorate(sessionMetricsMs, formatCacheModule(efficiency)));
  }

  // Add context usage with limit
  if (show("context")) {
    const tokens = contextTokens ?? {
      percentage: 0,
      inputTokens: 0,
      contextLimit: 0,
    };
    components.push(decorate(contextTokensMs, formatContextModule(tokens)));
  }

  if (show("session")) {
    const sessionRateLimit = formatRateLimitModule(
      "5h",
      FIVE_HOURS_IN_SECONDS,
      rateLimits?.five_hour,
      nowUnixSeconds,
      fiveHourTimeToHitSeconds,
    );
    if (sessionRateLimit) {
      components.push(decorate(rateLimitHistoryMs, sessionRateLimit));
    }
  }

  if (show("week")) {
    const weeklyRateLimit = formatRateLimitModule(
      "7d",
      SEVEN_DAYS_IN_SECONDS,
      rateLimits?.seven_day,
      nowUnixSeconds,
      sevenDayTimeToHitSeconds,
    );
    if (weeklyRateLimit) {
      components.push(decorate(rateLimitHistoryMs, weeklyRateLimit));
    }
  }

  // Add session duration
  if (show("duration") && cost) {
    const durationDisplay = formatDuration(cost.total_duration_ms);
    components.push(decorate(0, `⏱️ ${durationDisplay}`));
  }

  // Add lines changed
  if (
    show("lines") && cost &&
    (cost.total_lines_added > 0 || cost.total_lines_removed > 0)
  ) {
    components.push(
      decorate(0, `+${cost.total_lines_added}/-${cost.total_lines_removed}`),
    );
  }

  // Get just the directory name for cleaner display
  if (show("dir")) {
    const dirName = currentDir ? basename(currentDir) : "~";
    components.push(decorate(0, `📂 ${dirName}`));
  }

  // Add git branch if available
  if (show("git") && gitInfo) {
    components.push(decorate(gitInfoMs, `🌿 ${gitInfo.branch}`));
  }

  // Add weather if available
  if (show("weather") && weatherInfo) {
    components.push(
      decorate(
        weatherInfoMs,
        `${weatherInfo.icon} ${weatherInfo.temperature}°C`,
      ),
    );
  }

  // Render debug last so it captures the time spent on every other widget.
  if (debugActive) {
    const elapsedMs = Math.round(performance.now() - startedAtMs);
    const debugParts = [`${elapsedMs}ms`];
    if (show("session")) {
      debugParts.push(`5h:${nextRateLimitHistory.five_hour.length}`);
    }
    if (show("week")) {
      debugParts.push(`7d:${nextRateLimitHistory.seven_day.length}`);
    }
    components.push(`🐞 ${debugParts.join(" ")}`);
  }

  // Wrap components across lines when the terminal width is known; otherwise
  // emit a single line and let the terminal handle any wrapping.
  const separator = " | ";
  const terminalWidth = getTerminalWidth();
  const lines = terminalWidth
    ? packComponentsIntoLines(components, separator, terminalWidth)
    : [components.join(separator)];
  for (const line of lines) {
    console.log(prepareStatusLineOutput(line));
  }
}

if (import.meta.main) {
  try {
    await new Command()
      .name("claude-status-line")
      .version("0.1.0")
      .description("A status line for Claude Code")
      .option(
        "-c, --currency <currency:string>",
        "Currency code for session cost display",
        {
          default: "CAD",
        },
      )
      .option(
        "-l, --location <location:string>",
        "Weather location (city name or coordinates)",
      )
      .option(
        "-m, --modules <modules:string>",
        "Comma-separated list of modules to display (default: all). Valid modules: " +
          ALL_MODULES.join(", "),
      )
      .action(async (options) => {
        let modules: Set<Module> | undefined;
        if (options.modules) {
          modules = parseModules(options.modules);
        }
        await buildStatusLine({
          currency: options.currency,
          location: options.location,
          modules,
        });
      })
      .parse(Deno.args);
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
