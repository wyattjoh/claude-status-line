import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";

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

type GitInfo = {
  branch: string;
};

export async function getGitInfo(currentDir: string): Promise<GitInfo | null> {
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
      return { branch };
    }
  } catch {
    // Not a git repository or git command failed
  }

  return null;
}
