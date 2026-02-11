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
