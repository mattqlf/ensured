export interface TestCase {
  id: string;
  starting_url: string;
  task_prompt: string;
  created_at: string; // ISO date string
  // Add other fields as they become relevant
}

export interface TranscriptPart {
  type: "text" | "image";
  text?: string;
  url?: string;
  mime_type?: string;
  base64?: string;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface TranscriptStep {
  role: "user" | "tool" | "model";
  content: string | TranscriptPart[];
  name?: string;
  tool_calls?: ToolCall[];
}

export interface Run {
  run_id: string;
  url: string;
  prompt: string;
  status: "success" | "failure" | "in_progress" | "queued";
  timestamp: string; // ISO date string
  transcript: TranscriptStep[];
  project_id?: string;
  project_name?: string;
  repo_url?: string;
  // Add other fields as they become relevant
}
