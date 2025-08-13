#!/bin/bash

# Read Claude Code context from stdin
input=$(cat)

# Extract relevant information using jq
model_name=$(echo "$input" | jq -r '.model.display_name // "Claude"')
current_dir=$(echo "$input" | jq -r '.workspace.current_dir // ""')
project_dir=$(echo "$input" | jq -r '.workspace.project_dir // ""')

# Get just the directory name for cleaner display
if [[ -n "$current_dir" ]]; then
    dir_name=$(basename "$current_dir")
else
    dir_name="~"
fi

# Check if we're in a git repository and get branch
git_info=""
if [[ -d "$current_dir/.git" ]] || git -C "$current_dir" rev-parse --git-dir >/dev/null 2>&1; then
    branch=$(git -C "$current_dir" branch --show-current 2>/dev/null)
    if [[ -n "$branch" ]]; then
        git_info="🌿 $branch"  # Git branch with icon
    fi
fi

# Get project name if available
project_name=""
if [[ -n "$project_dir" ]] && [[ "$project_dir" != "$current_dir" ]]; then
    project_name="📁 $(basename "$project_dir")"  # Project icon
fi

# Get Claude session time remaining
session_time=""
if [[ -f "$HOME/.claude/scripts/claude-session-time.js" ]]; then
    session_time_raw=$(node "$HOME/.claude/scripts/claude-session-time.js" --statusline 2>/dev/null)
    if [[ -n "$session_time_raw" ]] && [[ "$session_time_raw" != "--:--:--" ]]; then
        session_time="⏰ $session_time_raw"
    fi
fi

# Build status line components with icons and separators
components=()

# Add project name if available
if [[ -n "$project_name" ]]; then
    components+=("$project_name")
fi

# Add AI model with icon
components+=("🤖 $model_name")

# Add Claude session time if available
if [[ -n "$session_time" ]]; then
    components+=("$session_time")
fi

# Add directory with icon
components+=("📂 $dir_name")

# Add git branch if available
if [[ -n "$git_info" ]]; then
    components+=("$git_info")
fi

# Join components with separator
printf "%s" "$(printf "%s | " "${components[@]}" | sed 's/ | $//')"