export interface ClaudeContext {
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
  cost:
    | {
      total_cost_usd: number;
      total_duration_ms: number;
      total_api_duration_ms: number;
      total_lines_added: number;
      total_lines_removed: number;
    }
    | undefined;
}
