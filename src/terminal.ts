import { execSync } from "node:child_process";
import process from "node:process";

function parsePositiveInteger(value: string): number | null {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function runShell(cmd: string): string | null {
  try {
    return execSync(cmd, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
      shell: "/bin/sh",
    }).trim();
  } catch {
    return null;
  }
}

function getParentProcessId(pid: number): number | null {
  const output = runShell(`ps -o ppid= -p ${pid}`);
  return output ? parsePositiveInteger(output) : null;
}

function getTTYForProcess(pid: number): string | null {
  const output = runShell(`ps -o tty= -p ${pid}`);
  if (!output) return null;
  const tty = output.replace(/\s+/g, "");
  if (!tty || tty === "?" || tty === "??") return null;
  return tty;
}

// Claude Code ≥ 2.1.139 spawns the status line without a controlling terminal,
// so `stty size < /dev/<tty>` fails with ENOTTY. `stty -F` (GNU) and `stty -f`
// (BSD) ask stty to open the device itself with O_NOCTTY semantics, which
// works regardless of controlling-tty status. See sirmalloc/ccstatusline#377.
function getWidthForTTY(tty: string): number | null {
  const devicePath = `/dev/${tty}`;
  const attempts = [
    `stty -F ${devicePath} size`,
    `stty -f ${devicePath} size`,
    `stty size < ${devicePath}`,
  ];

  for (const cmd of attempts) {
    const output = runShell(`${cmd} 2>/dev/null | awk '{print $2}'`);
    if (output === null) continue;
    const parsed = parsePositiveInteger(output);
    if (parsed !== null) return parsed;
  }

  return null;
}

export function getTerminalWidth(): number | null {
  if (process.platform === "win32") {
    return null;
  }

  let pid = process.pid;
  for (let depth = 0; depth < 8; depth += 1) {
    const parentPid = getParentProcessId(pid);
    if (parentPid === null) break;
    pid = parentPid;

    const tty = getTTYForProcess(pid);
    if (tty === null) continue;

    const width = getWidthForTTY(tty);
    if (width !== null) return width;
  }

  const tputOutput = runShell("tput cols 2>/dev/null");
  if (tputOutput !== null) {
    return parsePositiveInteger(tputOutput);
  }

  return null;
}
