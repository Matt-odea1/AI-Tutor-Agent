import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useChatStore } from '../store/chatStore';
import { useCodeExecution } from '../hooks/useCodeExecution';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { trackCodeExecuted } from '../utils/analytics';
import { 
  CodeEditorHeader, 
  CodeEditorControls, 
  CodeHistoryModal 
} from './CodeEditor/index';

interface CodeEditorProps {
  onSendMessage: (message: string) => void;
  showAskAI?: boolean;
}

export const CodeEditor = ({ onSendMessage, showAskAI = true }: CodeEditorProps) => {
  const { codeEditor, setEditorCode, setEditorOpen, setEditorOutput, setEditorExecuting, setEditorSelection, addToHistory, loadFromHistory, layoutMode } = useChatStore();
  const { runCode, isLoading } = useCodeExecution();
  const editorRef = useRef<HTMLDivElement>(null);
  const monacoEditorRef = useRef<any>(null);
  const [showHistory, setShowHistory] = useState(false);

  const handleBeforeMount = (monaco: any) => {
    monaco.editor.defineTheme('chat9021-light', {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#ffffff',
        'editorLineNumber.foreground': '#94a3b8',
        'editorLineNumber.activeForeground': '#475569',
        'editor.lineHighlightBackground': '#ffffff',
        'editor.lineHighlightBorder': '#ffffff',
        'editor.selectionBackground': '#e7e5ff',
        'editor.inactiveSelectionBackground': '#f1f5f9',
        'editor.selectionHighlightBorder': '#ffffff',
      },
    });
  };

  const handleEditorMount = (editor: any, monaco: any) => {
    monacoEditorRef.current = editor;
    monaco.editor.setTheme('chat9021-light');

    const updateSelection = () => {
      const selection = editor.getSelection?.();
      const model = editor.getModel?.();
      if (!selection || !model || selection.isEmpty?.()) {
        setEditorSelection(null);
        return;
      }
      const selectedText = model.getValueInRange(selection) || '';
      setEditorSelection(selectedText.trim() ? selectedText : null);
    };

    updateSelection();
    editor.onDidChangeCursorSelection(updateSelection);
  };

  const handleRunCode = async () => {
    setEditorExecuting(true);
    try {
      const result = await runCode(codeEditor.code);
      setEditorOutput(result.output, result.error);
      // Add to history after execution
      addToHistory(codeEditor.code, result.output, result.error);
      // Track code execution
      trackCodeExecuted(!!result.error);
    } finally {
      setEditorExecuting(false);
    }
  };

  const handleAskAI = () => {
    let message = '';
    
    if (codeEditor.lastError) {
      // User has an error - format debugging help request
      message = `Help me debug this Python code:\n\n\`\`\`python\n${codeEditor.code}\n\`\`\`\n\nI'm getting this error:\n\`\`\`\n${codeEditor.lastError}\n\`\`\`\n\nWhat's wrong and how do I fix it?`;
    } else if (codeEditor.lastOutput) {
      // Code ran successfully but user wants feedback
      message = `Help me with this Python code:\n\n\`\`\`python\n${codeEditor.code}\n\`\`\`\n\nIt produces this output:\n\`\`\`\n${codeEditor.lastOutput}\n\`\`\`\n\nCan you review it and provide feedback?`;
    } else {
      // No execution yet - general help request
      message = `Help me with this Python code:\n\n\`\`\`python\n${codeEditor.code}\n\`\`\`\n\nCan you review it and provide feedback on how to improve it?`;
    }
    
    // Send the formatted message to chat
    onSendMessage(message);
  };

  const handleClose = () => {
    setEditorOpen(false);
  };

  const handleClearOutput = () => {
    setEditorOutput(null, null);
  };


  // Keyboard shortcuts for code editor
  useKeyboardShortcuts([
    {
      key: 'Enter',
      ctrl: true,
      action: handleRunCode,
      description: 'Run code',
    },
    {
      key: 'e',
      ctrl: true,
      action: () => setEditorOpen(false),
      description: 'Close editor',
    },
  ], codeEditor.isOpen); // Only active when editor is open

  // Auto-scroll to editor when opened
  useEffect(() => {
    if (codeEditor.isOpen) {
      setTimeout(() => {
        editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [codeEditor.isOpen]);

  if (!codeEditor.isOpen) {
    return null;
  }

  // Count lines of code
  const lineCount = codeEditor.code.split('\n').length;

  // Determine status
  const hasError = !!codeEditor.lastError;
  const hasOutput = !!codeEditor.lastOutput;
  const status = hasError ? 'Error' : hasOutput ? 'Ready' : 'Not Run';
  const statusColor = hasError ? 'text-red-500' : hasOutput ? 'text-green-500' : 'text-gray-400';
  const statusIcon = hasError ? '⚠️' : hasOutput ? '✓' : '○';

  // Check if in split mode
  const isInSplitMode = layoutMode === 'split' && window.innerWidth >= 1024;

  return (
    <div 
      ref={editorRef}
      className={isInSplitMode ? "h-full flex flex-col" : "max-w-5xl mx-auto my-4 animate-fade-in"}
    >
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${
        isInSplitMode ? 'h-full flex flex-col bg-white' : 'bg-white rounded-2xl shadow-lg border border-gray-200'
      }`}>
        {codeEditor.isMinimized ? (
          // Minimized View - Compact Bar
          <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-green-50 to-emerald-50">
            <div className="flex items-center space-x-4">
              <span className="font-semibold text-gray-900">Python Editor</span>
              <span className="text-sm text-gray-500">•</span>
              <span className="text-sm text-gray-600">{lineCount} lines</span>
              <span className="text-sm text-gray-500">•</span>
              <span className={`text-sm font-medium ${statusColor} flex items-center space-x-1`}>
                <span>{statusIcon}</span>
                <span>{status}</span>
              </span>
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                className="text-gray-600 hover:text-gray-900 transition-colors p-2 rounded-lg hover:bg-white"
                aria-label="Expand editor"
                title="Expand editor"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 transition-colors p-2 rounded-lg hover:bg-white"
                aria-label="Close editor"
                title="Close editor"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        ) : (
          // Expanded View - Full Editor
          <>
            {/* Header */}
            <CodeEditorHeader
              onRunCode={handleRunCode}
              isExecuting={codeEditor.isExecuting}
              isLoading={isLoading}
            />

            {/* Editor */}
            <div className={isInSplitMode ? "flex-1 overflow-hidden" : "border-b border-gray-200"}>
              <div className="relative h-full">
                <Editor
                  height={isInSplitMode ? "100%" : "350px"}
                  language="python"
                  theme="chat9021-light"
                  value={codeEditor.code}
                  onChange={(value) => setEditorCode(value || '')}
                  beforeMount={handleBeforeMount}
                  onMount={handleEditorMount}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    tabSize: 4,
                    wordWrap: 'on',
                    formatOnPaste: true,
                    formatOnType: true,
                    padding: { top: 16, bottom: 0 },
                  }}
                  loading={
                    <div className="flex items-center justify-center h-[350px] bg-white">
                      <div className="flex flex-col items-center space-y-2">
                        <svg className="animate-spin h-8 w-8 text-gray-500" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <div className="text-gray-500 text-sm">Loading editor...</div>
                      </div>
                    </div>
                  }
                />
                {codeEditor.code.trim().length === 0 && (
                  <div className="pointer-events-none absolute top-3 left-4 text-sm text-gray-400">
                    Write and run Python code
                  </div>
                )}
              </div>
            </div>

            {/* Controls */}
            <CodeEditorControls 
              onRunCode={handleRunCode}
              onAskAI={handleAskAI}
              onShowHistory={() => setShowHistory(true)}
              isExecuting={codeEditor.isExecuting}
              isLoading={isLoading}
              hasHistory={codeEditor.history.length > 0}
              showAskAI={showAskAI}
              showRunHistory={false}
            />

            {/* Output Display */}
            {(codeEditor.lastOutput || codeEditor.lastError) && (
              <div className={`bg-slate-50 text-gray-800 ${isInSplitMode ? 'flex flex-col overflow-hidden min-h-[35%] max-h-[55%]' : ''}`}>
                <div className={`px-6 py-3 overflow-y-auto ${isInSplitMode ? 'flex-1' : 'max-h-40'}`}>
                  {codeEditor.lastOutput && (
                    <div>
                      <div className="flex items-center justify-between text-xs text-gray-400 mb-2 font-semibold">
                        <span>STDOUT:</span>
                        <button
                          onClick={handleClearOutput}
                          className="w-7 h-7 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors rounded flex items-center justify-center"
                          title="Clear output"
                          aria-label="Clear output"
                        >
                          ×
                        </button>
                      </div>
                      <pre className="text-sm font-mono whitespace-pre-wrap text-emerald-600 leading-relaxed">
                        {codeEditor.lastOutput}
                      </pre>
                    </div>
                  )}
                  
                  {codeEditor.lastError && (
                    <div className={codeEditor.lastOutput ? 'mt-4' : ''}>
                      <div className="text-xs text-red-400 mb-2 font-semibold flex items-center space-x-2">
                        <span>ERROR DETAILS:</span>
                      </div>
                      <pre className="text-sm font-mono whitespace-pre-wrap text-red-600 leading-relaxed bg-red-50 p-4 rounded-lg border border-red-200">
                        {codeEditor.lastError}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* History Modal */}
      {showHistory && (
        <CodeHistoryModal
          history={codeEditor.history}
          onClose={() => setShowHistory(false)}
          onLoadEntry={(entry) => {
            loadFromHistory(codeEditor.history.indexOf(entry));
          }}
        />
      )}
    </div>
  );
};
