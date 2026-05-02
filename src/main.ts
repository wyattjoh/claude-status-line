import { basename } from "node:path";
import process from "node:process";
import { Buffer } from "node:buffer";
import { logger } from "ccusage/logger";
import { calculateContextTokens } from "ccusage/data-loader";
import { Command } from "@cliffy/command";

import { formatCurrency } from "./currency.ts";
import {
  calculateCacheEfficiency,
  formatCompactNumber,
  formatDuration,
  prepareStatusLineOutput,
  shortenModelName,
} from "./format.ts";
import { getGitInfo } from "./git.ts";
import {
  FIVE_HOURS_IN_SECONDS,
  formatRateLimitModule,
  SEVEN_DAYS_IN_SECONDS,
} from "./limits.ts";
import { loadSessionMetrics } from "./session.ts";
import {
  computeBurnRate,
  createEmptyRateLimitHistory,
  getDefaultRateLimitHistoryPath,
  loadRateLimitHistory,
  pruneWindowSamples,
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

interface BuildOptions {
  currency: string;
  location: string | undefined;
  modules: Set<Module> | undefined;
}

async function buildStatusLine(options: BuildOptions): Promise<void> {
  // Disable logging from ccusage.
  logger.removeReporter();

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

  // Load async data in parallel for better performance
  const [
    sessionMetrics,
    contextTokens,
    gitInfo,
    weatherInfo,
    rateLimitHistory,
  ] = await Promise
    .all([
      loadSessionMetrics(sessionID),
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
        : calculateContextTokens(transcriptPath, modelID),
      getGitInfo(currentDir),
      options.location ? getWeather(options.location) : Promise.resolve(null),
      rateLimitHistoryPath
        ? loadRateLimitHistory(rateLimitHistoryPath)
        : Promise.resolve(createEmptyRateLimitHistory()),
    ]);

  const nextRateLimitHistory = {
    five_hour: rateLimits?.five_hour
      ? updateWindowSamples(rateLimitHistory.five_hour, {
        timestamp: nowUnixSeconds,
        used_percentage: rateLimits.five_hour.used_percentage,
        resets_at: rateLimits.five_hour.resets_at,
      }, nowUnixSeconds)
      : pruneWindowSamples(rateLimitHistory.five_hour, { nowUnixSeconds }),
    seven_day: rateLimits?.seven_day
      ? updateWindowSamples(rateLimitHistory.seven_day, {
        timestamp: nowUnixSeconds,
        used_percentage: rateLimits.seven_day.used_percentage,
        resets_at: rateLimits.seven_day.resets_at,
      }, nowUnixSeconds)
      : pruneWindowSamples(rateLimitHistory.seven_day, { nowUnixSeconds }),
  };
  const fiveHourBurnRate = rateLimits?.five_hour
    ? computeBurnRate(nextRateLimitHistory.five_hour)
    : undefined;
  const sevenDayBurnRate = rateLimits?.seven_day
    ? computeBurnRate(nextRateLimitHistory.seven_day)
    : undefined;

  if (rateLimitHistoryPath) {
    try {
      await saveRateLimitHistory(rateLimitHistoryPath, nextRateLimitHistory);
    } catch {
      // Persistence is best-effort and must not break the status line.
    }
  }

  // Build status line components with icons and separators
  const components: string[] = [];
  const show = (name: Module) => !options.modules || options.modules.has(name);

  // Get project name if available
  if (show("project") && projectDir && projectDir !== currentDir) {
    components.push(`📁 ${basename(projectDir)}`);
  }

  // Add AI model with icon - show multiple models if used
  if (show("model")) {
    if (sessionMetrics && sessionMetrics.modelsUsed.length > 1) {
      const shortNames = sessionMetrics.modelsUsed.map(shortenModelName);
      components.push(`🤖 ${shortNames.join("+")}`);
    } else {
      components.push(`🤖 ${modelName}`);
    }
  }

  // Add session cost with currency code
  if (show("cost")) {
    if (cost) {
      const sessionDisplay = await formatCurrency(
        cost.total_cost_usd,
        options.currency,
      );
      components.push(`💰 ${sessionDisplay} ${options.currency}`);
    } else if (sessionMetrics) {
      const sessionDisplay = await formatCurrency(
        sessionMetrics.totalCost,
        options.currency,
      );
      components.push(`💰 ${sessionDisplay} ${options.currency}`);
    }
  }

  // Add token counts (input/output)
  if (show("tokens") && sessionMetrics) {
    const inputDisplay = formatCompactNumber(sessionMetrics.inputTokens);
    const outputDisplay = formatCompactNumber(sessionMetrics.outputTokens);
    components.push(`📊 ${inputDisplay}/${outputDisplay}`);
  }

  // Add cache efficiency
  if (show("cache") && sessionMetrics) {
    const efficiency = calculateCacheEfficiency(
      sessionMetrics.cacheReadTokens,
      sessionMetrics.inputTokens,
    );
    components.push(formatCacheModule(efficiency));
  }

  // Add context usage with limit
  if (show("context")) {
    if (contextTokens) {
      components.push(formatContextModule(contextTokens));
    } else {
      components.push(formatContextModule({
        percentage: 0,
        inputTokens: 0,
        contextLimit: 0,
      }));
    }
  }

  if (show("session")) {
    const sessionRateLimit = formatRateLimitModule(
      "5h",
      FIVE_HOURS_IN_SECONDS,
      rateLimits?.five_hour,
      nowUnixSeconds,
      fiveHourBurnRate,
    );
    if (sessionRateLimit) {
      components.push(sessionRateLimit);
    }
  }

  if (show("week")) {
    const weeklyRateLimit = formatRateLimitModule(
      "7d",
      SEVEN_DAYS_IN_SECONDS,
      rateLimits?.seven_day,
      nowUnixSeconds,
      sevenDayBurnRate,
    );
    if (weeklyRateLimit) {
      components.push(weeklyRateLimit);
    }
  }

  // Add session duration
  if (show("duration") && cost) {
    const durationDisplay = formatDuration(cost.total_duration_ms);
    components.push(`⏱️ ${durationDisplay}`);
  }

  // Add lines changed
  if (
    show("lines") && cost &&
    (cost.total_lines_added > 0 || cost.total_lines_removed > 0)
  ) {
    components.push(`+${cost.total_lines_added}/-${cost.total_lines_removed}`);
  }

  // Get just the directory name for cleaner display
  if (show("dir")) {
    const dirName = currentDir ? basename(currentDir) : "~";
    components.push(`📂 ${dirName}`);
  }

  // Add git branch if available
  if (show("git") && gitInfo) {
    components.push(`🌿 ${gitInfo.branch}`);
  }

  // Add weather if available
  if (show("weather") && weatherInfo) {
    components.push(`${weatherInfo.icon} ${weatherInfo.temperature}°C`);
  }

  // Join components with separator and output
  console.log(prepareStatusLineOutput(components.join(" | ")));
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
