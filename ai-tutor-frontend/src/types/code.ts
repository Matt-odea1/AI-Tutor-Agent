export interface CodeExecutionResult {
  output: string;
  error: string | null;
  executionTime?: number;
}

export interface CodeSnippet {
  id: string;
  code: string;
  language: string;
  output?: string;
  error?: string;
  timestamp: Date;
}

export interface CodeExecutionHistoryEntry {
  code: string;
  output: string | null;
  error: string | null;
  timestamp: number;
}

export interface CodeEditorState {
  code: string;
  isOpen: boolean;
  isMinimized: boolean;
  lastOutput: string | null;
  lastError: string | null;
  isExecuting: boolean;
  selection: string | null;
  history: CodeExecutionHistoryEntry[];
}

export interface EditorDecoration {
  startLine: number;
  endLine: number;
  className: string;
}

export interface EditorDeletionZone {
  line: number;
  content: string;
}

export interface CodeProgram {
  program_id: string;
  workspace_id: string;
  code_memory_id: string;
  title: string;
  language: string;
  current_code: string;
  last_output?: string | null;
  last_error?: string | null;
  created_at: string;
  last_accessed: string;
}
