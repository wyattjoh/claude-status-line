import { join } from "node:path";
import { readdir, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline/promises";
import process from "node:process";

interface UsageEntry {
  timestamp: Date;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  model: string;
  sessionId: string;
  cwd: string;
}

interface SessionBlock {
  start: Date;
  end: Date;
  entries: UsageEntry[];
  isActive: boolean;
}

/**
 * The session data is passed to the status line script.
 */
interface SessionData {
  /**
   * The start time of the session.
   */
  start: Date;

  /**
   * Whether the session is active.
   */
  isActive: boolean;
}

const DEFAULT_SESSION_DURATION_HOURS = 5;
const SESSION_DURATION_MS = DEFAULT_SESSION_DURATION_HOURS * 60 * 60 * 1000;
const USER_HOME_DIR = process.env.HOME ?? process.env.USERPROFILE ?? "";

const CLAUDE_PATHS = [
  join(USER_HOME_DIR, ".claude"),
  join(USER_HOME_DIR, ".config", "claude"),
];

async function isDirectory(dirPath: string): Promise<boolean> {
  try {
    const stats = await stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function findJsonlFiles(): Promise<string[]> {
  const files: string[] = [];

  for (const claudePath of CLAUDE_PATHS) {
    const projectsPath = join(claudePath, "projects");

    if (!(await isDirectory(projectsPath))) {
      continue;
    }

    try {
      await walkDirectory(projectsPath, files);
    } catch {
      // Silently continue if we can't read a directory
    }
  }

  return files;
}

async function walkDirectory(dir: string, files: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      await walkDirectory(fullPath, files);
    } else if (entry.name.endsWith(".jsonl")) {
      files.push(fullPath);
    }
  }
}

async function parseTodaysJsonlFile(
  filePath: string,
  today: Date,
): Promise<UsageEntry[]> {
  const entries: UsageEntry[] = [];

  try {
    // If the file is older than today, skip it, it can't contain any of today's
    // data.
    const { mtime } = await stat(filePath);
    if (mtime < today) {
      return [];
    }

    const lines = createInterface({
      input: createReadStream(filePath, { encoding: "utf-8" }),
      crlfDelay: Infinity,
    });

    for await (const line of lines) {
      try {
        const data = JSON.parse(line);

        if (data.timestamp && data.message?.usage) {
          const usage = data.message.usage;
          const timestamp = new Date(data.timestamp);
          if (timestamp < today) {
            continue;
          }

          entries.push({
            timestamp,
            inputTokens: usage.input_tokens || 0,
            outputTokens: usage.output_tokens || 0,
            cacheCreationTokens: usage.cache_creation_input_tokens || 0,
            cacheReadTokens: usage.cache_read_input_tokens || 0,
            model: data.message.model || "unknown",
            sessionId: data.sessionId || "unknown",
            cwd: data.cwd || "unknown",
          });
        }
      } catch {
        // Skip invalid JSON lines
      }
    }
  } catch {
    // Ignore files we can't read
  }

  return entries;
}

function floorToHour(date: Date): Date {
  const floored = new Date(date);
  floored.setMinutes(0, 0, 0);
  return floored;
}

function identifySessionBlocks(entries: UsageEntry[]): SessionBlock[] {
  if (entries.length === 0) {
    return [];
  }

  const blocks: SessionBlock[] = [];
  const sortedEntries = [...entries].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  );

  let currentBlockStart: Date | null = null;
  let currentBlockEntries: UsageEntry[] = [];
  const now = new Date();

  for (const entry of sortedEntries) {
    const entryTime = entry.timestamp;

    if (currentBlockStart === null) {
      currentBlockStart = floorToHour(entryTime);
      currentBlockEntries = [entry];
    } else {
      const timeSinceBlockStart = entryTime.getTime() -
        currentBlockStart.getTime();
      const lastEntry = currentBlockEntries[currentBlockEntries.length - 1];
      const timeSinceLastEntry = entryTime.getTime() -
        lastEntry.timestamp.getTime();

      if (
        timeSinceBlockStart > SESSION_DURATION_MS ||
        timeSinceLastEntry > SESSION_DURATION_MS
      ) {
        blocks.push({
          start: currentBlockStart,
          end: lastEntry.timestamp,
          entries: currentBlockEntries,
          isActive: false,
        });

        currentBlockStart = floorToHour(entryTime);
        currentBlockEntries = [entry];
      } else {
        currentBlockEntries.push(entry);
      }
    }
  }

  if (currentBlockStart !== null && currentBlockEntries.length > 0) {
    const lastEntry = currentBlockEntries[currentBlockEntries.length - 1];
    const timeSinceLastEntry = now.getTime() - lastEntry.timestamp.getTime();

    const isActive = timeSinceLastEntry < SESSION_DURATION_MS &&
      now.getTime() - currentBlockStart.getTime() < SESSION_DURATION_MS;

    blocks.push({
      start: currentBlockStart,
      end: lastEntry.timestamp,
      entries: currentBlockEntries,
      isActive,
    });
  }

  return blocks;
}

/**
 * Formats a time duration in milliseconds into a human-readable string.
 *
 * @param ms - The time duration in milliseconds
 * @param formatStatusLine - If true, formats for status line display (e.g., "2h 30m left"),
 *                          if false, formats as HH:MM:SS
 * @returns The formatted time string
 */
export function formatTimeLeft(ms: number, formatStatusLine = false): string {
  if (ms <= 0) {
    return formatStatusLine ? "No time left" : "00:00:00";
  }

  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((ms % (1000 * 60)) / 1000);

  if (formatStatusLine) {
    if (hours > 0) {
      return `${hours}h ${minutes}m left`;
    } else if (minutes > 0) {
      return `${minutes}m left`;
    } else {
      return `${seconds}s left`;
    }
  }

  return `${String(hours).padStart(2, "0")}:${
    String(minutes).padStart(
      2,
      "0",
    )
  }:${String(seconds).padStart(2, "0")}`;
}

/**
 * Retrieves the current Claude session data by analyzing JSONL files from Claude directories.
 * Looks for active sessions and returns session start time if found.
 *
 * @returns Promise that resolves to session data if an active session is found, null otherwise
 */
export async function getSessionData(): Promise<SessionData | null> {
  const jsonlFiles = await findJsonlFiles();
  if (jsonlFiles.length === 0) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const entryArrays = await Promise.all(
    jsonlFiles.map((file) => parseTodaysJsonlFile(file, today)),
  );

  // Flatten the arrays into a single array.
  const allEntries = entryArrays.flat();
  if (allEntries.length === 0) {
    return null;
  }

  const blocks = identifySessionBlocks(allEntries);
  const activeBlock = blocks.find((b) => b.isActive);

  if (activeBlock) {
    return {
      start: activeBlock.start,
      isActive: true,
    };
  }

  return null;
}
