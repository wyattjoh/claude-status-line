#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Constants from ccusage
const DEFAULT_SESSION_DURATION_HOURS = 5;
const SESSION_DURATION_MS = DEFAULT_SESSION_DURATION_HOURS * 60 * 60 * 1000;
const USER_HOME_DIR = process.env.HOME ?? process.env.USERPROFILE ?? os.homedir();

// Paths where Claude Code stores data
const CLAUDE_PATHS = [
  path.join(USER_HOME_DIR, '.claude'),
  path.join(USER_HOME_DIR, '.config', 'claude')
];

// Helper function to check if directory exists
async function isDirectory(dirPath) {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

// Find all JSONL files in Claude projects directories
async function findJsonlFiles() {
  const files = [];
  
  for (const claudePath of CLAUDE_PATHS) {
    const projectsPath = path.join(claudePath, 'projects');
    
    if (!(await isDirectory(projectsPath))) {
      continue;
    }
    
    try {
      await walkDirectory(projectsPath, files);
    } catch (err) {
      // Silently continue if we can't read a directory
    }
  }
  
  return files;
}

// Recursively walk directory to find JSONL files
async function walkDirectory(dir, files) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      await walkDirectory(fullPath, files);
    } else if (entry.name.endsWith('.jsonl')) {
      files.push(fullPath);
    }
  }
}

// Parse JSONL file and extract usage entries
async function parseJsonlFile(filePath) {
  const entries = [];
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.length > 0);
    
    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        
        // Validate basic structure
        if (data.timestamp && data.message?.usage) {
          entries.push({
            timestamp: new Date(data.timestamp),
            inputTokens: data.message.usage.input_tokens || 0,
            outputTokens: data.message.usage.output_tokens || 0,
            cacheCreationTokens: data.message.usage.cache_creation_input_tokens || 0,
            cacheReadTokens: data.message.usage.cache_read_input_tokens || 0,
            model: data.message.model || 'unknown',
            sessionId: data.sessionId || 'unknown',
            cwd: data.cwd || 'unknown'
          });
        }
      } catch {
        // Skip invalid JSON lines
      }
    }
  } catch (err) {
    // Ignore files we can't read
  }
  
  return entries;
}

// Floor date to the nearest hour
function floorToHour(date) {
  const floored = new Date(date);
  floored.setMinutes(0, 0, 0);
  return floored;
}

// Identify session blocks (based on ccusage logic)
function identifySessionBlocks(entries) {
  if (entries.length === 0) {
    return [];
  }
  
  const blocks = [];
  const sortedEntries = [...entries].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  
  let currentBlockStart = null;
  let currentBlockEntries = [];
  const now = new Date();
  
  for (const entry of sortedEntries) {
    const entryTime = entry.timestamp;
    
    if (currentBlockStart === null) {
      // First entry - start a new block
      currentBlockStart = floorToHour(entryTime);
      currentBlockEntries = [entry];
    } else {
      const timeSinceBlockStart = entryTime.getTime() - currentBlockStart.getTime();
      const lastEntry = currentBlockEntries[currentBlockEntries.length - 1];
      const timeSinceLastEntry = entryTime.getTime() - lastEntry.timestamp.getTime();
      
      // Check if we need to start a new block
      if (timeSinceBlockStart > SESSION_DURATION_MS || timeSinceLastEntry > SESSION_DURATION_MS) {
        // Close current block
        blocks.push({
          start: currentBlockStart,
          end: lastEntry.timestamp,
          entries: currentBlockEntries,
          isActive: false
        });
        
        // Start new block
        currentBlockStart = floorToHour(entryTime);
        currentBlockEntries = [entry];
      } else {
        // Add to current block
        currentBlockEntries.push(entry);
      }
    }
  }
  
  // Handle the last block
  if (currentBlockStart !== null && currentBlockEntries.length > 0) {
    const lastEntry = currentBlockEntries[currentBlockEntries.length - 1];
    const timeSinceLastEntry = now.getTime() - lastEntry.timestamp.getTime();
    
    // Check if this block is still active
    const isActive = timeSinceLastEntry < SESSION_DURATION_MS && 
                     (now.getTime() - currentBlockStart.getTime()) < SESSION_DURATION_MS;
    
    blocks.push({
      start: currentBlockStart,
      end: lastEntry.timestamp,
      entries: currentBlockEntries,
      isActive
    });
  }
  
  return blocks;
}

// Format time duration for display
function formatTimeLeft(ms, forStatusline = false) {
  if (ms <= 0) {
    return forStatusline ? 'No time left' : '00:00:00';
  }
  
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((ms % (1000 * 60)) / 1000);
  
  if (forStatusline) {
    // Format as "Xh Ym left"
    if (hours > 0) {
      return `${hours}h ${minutes}m left`;
    } else if (minutes > 0) {
      return `${minutes}m left`;
    } else {
      return `${seconds}s left`;
    }
  }
  
  // Original format for live counter
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Get session data
async function getSessionData() {
  // Find all JSONL files
  const jsonlFiles = await findJsonlFiles();
  
  if (jsonlFiles.length === 0) {
    return null;
  }
  
  // Parse all files and collect entries
  const allEntries = [];
  for (const file of jsonlFiles) {
    const entries = await parseJsonlFile(file);
    allEntries.push(...entries);
  }
  
  // Filter entries from today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEntries = allEntries.filter(e => e.timestamp >= today);
  
  if (todayEntries.length === 0) {
    return null;
  }
  
  // Identify session blocks
  const blocks = identifySessionBlocks(todayEntries);
  
  // Find active block
  const activeBlock = blocks.find(b => b.isActive);
  
  if (activeBlock) {
    return {
      start: activeBlock.start,
      isActive: true
    };
  }
  
  return null;
}

// Clear console and move cursor to top
function clearConsole() {
  console.clear();
  process.stdout.write('\x1B[2J\x1B[0f');
}

// Main function
async function main() {
  // Check for statusline mode flag
  const statuslineMode = process.argv.includes('--statusline');
  
  // Get initial session data
  const sessionData = await getSessionData();
  
  if (!sessionData) {
    if (statuslineMode) {
      // Don't output anything when no session in statusline mode
    } else {
      console.log('No active session');
    }
    process.exit(0);
  }
  
  if (statuslineMode) {
    // Statusline mode: output just the time remaining once with "Xh Ym left" format
    const now = new Date();
    const elapsed = now.getTime() - sessionData.start.getTime();
    const remaining = Math.max(0, SESSION_DURATION_MS - elapsed);
    
    console.log(formatTimeLeft(remaining, true));
    process.exit(0);
  }
  
  // Interactive mode: Update display every second
  setInterval(() => {
    clearConsole();
    
    const now = new Date();
    const elapsed = now.getTime() - sessionData.start.getTime();
    const remaining = Math.max(0, SESSION_DURATION_MS - elapsed);
    
    // Color based on time remaining
    let color = '\x1b[32m'; // Green
    if (remaining < 30 * 60 * 1000) { // Less than 30 minutes
      color = '\x1b[31m'; // Red
    } else if (remaining < 60 * 60 * 1000) { // Less than 1 hour
      color = '\x1b[33m'; // Yellow
    }
    
    // Display time remaining
    console.log(`${color}${formatTimeLeft(remaining)}\x1b[0m`);
    
    // Exit if session expired
    if (remaining === 0) {
      console.log('\nSession expired');
      process.exit(0);
    }
  }, 1000);
  
  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    clearConsole();
    process.exit(0);
  });
}

// Run the script
main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});