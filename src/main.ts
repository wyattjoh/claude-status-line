import { basename } from "node:path";
import process from "node:process";
import { Buffer } from "node:buffer";
import { logger } from "ccusage/logger";
import {
  calculateContextTokens,
  loadSessionUsageById,
} from "ccusage/data-loader";
import { Command } from "@cliffy/command";

import { formatCurrency } from "./currency.ts";
import { getGitInfo } from "./git.ts";
import type { ClaudeContext } from "./types.ts";

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
  }: ClaudeContext = JSON.parse(input);

  // Build status line components with icons and separators
  const components: string[] = [];

  // Get project name if available
  let projectName: string | undefined;
  if (projectDir && projectDir !== currentDir) {
    projectName = `📁 ${basename(projectDir)}`;
  }

  // Add project name if available
  if (projectName) {
    components.push(projectName);
  }

  // Add AI model with icon
  components.push(`🤖 ${modelName}`);

  // Load the session usage by ID and format the cost in the specified currency.
  const sessionUsage = await loadSessionUsageById(sessionID, {
    mode: "auto",
    offline: false,
  });
  if (sessionUsage) {
    const sessionDisplay = await formatCurrency(
      sessionUsage.totalCost,
      currency,
    );
    components.push(`💰 ${sessionDisplay} session`);
  }

  const contextTokens = await calculateContextTokens(transcriptPath);
  if (contextTokens) {
    components.push(`📈 ${contextTokens.percentage}%`);
  } else {
    components.push(`📈 0%`);
  }

  // Get just the directory name for cleaner display
  const dirName = currentDir ? basename(currentDir) : "~";
  components.push(`📂 ${dirName}`);

  // Get git information and add to components.
  const gitInfo = await getGitInfo(currentDir);
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
