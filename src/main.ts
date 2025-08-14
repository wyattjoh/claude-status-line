import { basename } from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";
import { Buffer } from "node:buffer";

import { formatTimeLeft, getSessionData } from "./claude.ts";

/**
 * The Claude context object is passed to the statusline script.
 *
 * @see https://docs.anthropic.com/en/docs/claude-code/statusline
 */
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

const SESSION_DURATION_MS = 5 * 60 * 60 * 1000; // 5 hours

function runCommand(cmd: string[], cwd: string): Promise<string> {
  try {
    return new Promise((resolve) => {
      const child = spawn(cmd[0], cmd.slice(1), {
        cwd,
        stdio: ["ignore", "pipe", "ignore"],
      });

      let output = "";
      child.stdout.on("data", (data: Buffer) => {
        output += data.toString();
      });

      child.on("close", () => {
        resolve(output.trim());
      });

      child.on("error", () => {
        resolve("");
      });
    });
  } catch {
    return Promise.resolve("");
  }
}

async function getGitInfo(currentDir: string): Promise<string> {
  try {
    // Check if we're in a git repository
    await new Promise<void>((resolve, reject) => {
      const child = spawn("git", ["-C", currentDir, "rev-parse", "--git-dir"], {
        stdio: ["ignore", "pipe", "ignore"],
      });
      child.on("close", (code: number) => {
        if (code === 0) resolve();
        else reject();
      });
      child.on("error", reject);
    });

    // Get current branch
    const branch = await runCommand(
      ["git", "branch", "--show-current"],
      currentDir,
    );
    if (branch) {
      return `🌿 ${branch}`;
    }
  } catch {
    // Not a git repository or git command failed
  }

  return "";
}

async function getSessionTime(): Promise<string | null> {
  const sessionData = await getSessionData();
  if (!sessionData) {
    return null;
  }

  const now = new Date();
  const elapsed = now.getTime() - sessionData.start.getTime();
  const remaining = Math.max(0, SESSION_DURATION_MS - elapsed);

  if (remaining > 0) {
    return `⏰ ${formatTimeLeft(remaining, true)}`;
  }

  return null;
}

async function main(): Promise<void> {
  // Read Claude Code context from stdin
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks).toString();

  const {
    model: { display_name: modelName },
    workspace: { current_dir: currentDir, project_dir: projectDir },
  }: ClaudeContext = JSON.parse(input);

  // Get just the directory name for cleaner display
  const dirName = currentDir ? basename(currentDir) : "~";

  // Get git information
  const gitInfo = await getGitInfo(currentDir);

  // Build status line components with icons and separators
  const components: string[] = [];

  // Get project name if available
  let projectName: string | undefined;
  if (projectDir && projectDir !== currentDir) {
    projectName = `📁 ${basename(projectDir)}`;
  }

  // Get Claude session time remaining
  const sessionTime = await getSessionTime();

  // Add project name if available
  if (projectName) {
    components.push(projectName);
  }

  // Add AI model with icon
  components.push(`🤖 ${modelName}`);

  // Add Claude session time if available
  if (sessionTime) {
    components.push(sessionTime);
  }

  // Add directory with icon
  components.push(`📂 ${dirName}`);

  // Add git branch if available
  if (gitInfo) {
    components.push(gitInfo);
  }

  // Join components with separator and output
  const statusLine = components.join(" | ");
  console.log(statusLine);
}

if (import.meta.main) {
  try {
    await main();
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
