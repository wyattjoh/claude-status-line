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
  shortenModelName,
} from "./format.ts";
import { getGitInfo } from "./git.ts";
import { loadSessionMetrics } from "./session.ts";
import type { ClaudeContext } from "./types.ts";

function parseClaudeContext(input: string): ClaudeContext {
  try {
    return JSON.parse(input) as ClaudeContext;
  } catch {
    throw new Error("Invalid JSON input from Claude Code");
  }
}

async function buildStatusLine(currency: string): Promise<void> {
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
    model: { display_name: modelName },
    workspace: { current_dir: currentDir, project_dir: projectDir },
    cost,
  } = parseClaudeContext(input);

  // Load async data in parallel for better performance
  const [sessionMetrics, contextTokens, gitInfo] = await Promise.all([
    loadSessionMetrics(sessionID),
    calculateContextTokens(transcriptPath),
    getGitInfo(currentDir),
  ]);

  // Build status line components with icons and separators
  const components: string[] = [];

  // Get project name if available
  if (projectDir && projectDir !== currentDir) {
    components.push(`📁 ${basename(projectDir)}`);
  }

  // Add AI model with icon - show multiple models if used
  if (sessionMetrics && sessionMetrics.modelsUsed.length > 1) {
    const shortNames = sessionMetrics.modelsUsed.map(shortenModelName);
    components.push(`🤖 ${shortNames.join("+")}`);
  } else {
    components.push(`🤖 ${modelName}`);
  }

  // Add session cost with currency code
  if (cost) {
    const sessionDisplay = await formatCurrency(cost.total_cost_usd, currency);
    components.push(`💰 ${sessionDisplay} ${currency}`);
  } else if (sessionMetrics) {
    const sessionDisplay = await formatCurrency(
      sessionMetrics.totalCost,
      currency,
    );
    components.push(`💰 ${sessionDisplay} ${currency}`);
  }

  // Add token counts (input/output)
  if (sessionMetrics) {
    const inputDisplay = formatCompactNumber(sessionMetrics.inputTokens);
    const outputDisplay = formatCompactNumber(sessionMetrics.outputTokens);
    components.push(`📊 ${inputDisplay}/${outputDisplay}`);
  }

  // Add cache efficiency
  if (sessionMetrics) {
    const efficiency = calculateCacheEfficiency(
      sessionMetrics.cacheReadTokens,
      sessionMetrics.inputTokens,
    );
    components.push(`⚡ ${efficiency}%`);
  }

  // Add context usage with limit
  if (contextTokens) {
    const currentDisplay = formatCompactNumber(contextTokens.inputTokens);
    const limitDisplay = formatCompactNumber(contextTokens.contextLimit);
    components.push(
      `📈 ${contextTokens.percentage}% (${currentDisplay}/${limitDisplay})`,
    );
  } else {
    components.push(`📈 0%`);
  }

  // Add session duration
  if (cost) {
    const durationDisplay = formatDuration(cost.total_duration_ms);
    components.push(`⏱️ ${durationDisplay}`);
  }

  // Add lines changed
  if (cost && (cost.total_lines_added > 0 || cost.total_lines_removed > 0)) {
    components.push(`+${cost.total_lines_added}/-${cost.total_lines_removed}`);
  }

  // Get just the directory name for cleaner display
  const dirName = currentDir ? basename(currentDir) : "~";
  components.push(`📂 ${dirName}`);

  // Add git branch if available
  if (gitInfo) {
    components.push(`🌿 ${gitInfo.branch}`);
  }

  // Join components with separator and output
  console.log(components.join(" | "));
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
      .action(async (options) => {
        await buildStatusLine(options.currency);
      })
      .parse(Deno.args);
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
