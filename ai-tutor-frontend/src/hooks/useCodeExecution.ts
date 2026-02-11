import { useState } from 'react';
import { getPyodide } from '../utils/pyodideLoader';
import type { CodeExecutionResult } from '../types/code';

/**
 * Custom hook for executing Python code in the browser using Pyodide
 * 
 * Handles code execution, output/error capture, and execution timing.
 * Uses Pyodide WebAssembly runtime for client-side Python execution.
 * 
 * @returns Object containing:
 *   - isLoading: Boolean indicating if code is currently executing
 *   - result: Last execution result (output, error, execution time)
 *   - runCode: Async function to execute Python code
 * 
 * @example
 * ```tsx
 * const { runCode, isLoading, result } = useCodeExecution();
 * 
 * const handleRun = async () => {
 *   const result = await runCode('print("Hello, World!")');
 *   console.log(result.output); // => "Hello, World!\n"
 * };
 * ```
 * 
 * @remarks
 * - First code execution loads Pyodide (~10MB), subsequent runs are fast
 * - Captures both stdout and stderr separately
 * - Formats Python tracebacks for better readability
 * - Execution happens entirely in the browser (no server calls)
 */
export function useCodeExecution() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<CodeExecutionResult | null>(null);

  const runCode = async (code: string): Promise<CodeExecutionResult> => {
    setIsLoading(true);
    const startTime = performance.now();

    try {
      // Load Pyodide (cached after first load)
      const pyodide = await getPyodide();

      // Reset stdout/stderr capture and setup traceback formatting
      await pyodide.runPythonAsync(`
import sys
import traceback
from io import StringIO
sys.stdout = StringIO()
sys.stderr = StringIO()
`);

      // Execute user code with better error handling
      try {
        await pyodide.runPythonAsync(code);
      } catch (pythonError: any) {
        // If there's a Python exception, format it nicely
        const formattedError = await pyodide.runPythonAsync(`
import sys
import traceback
exc_type, exc_value, exc_tb = sys.exc_info()
if exc_type:
    tb_lines = traceback.format_exception(exc_type, exc_value, exc_tb)
    ''.join(tb_lines)
else:
    str(${JSON.stringify(pythonError.message)})
`);

        const stderr = await pyodide.runPythonAsync('sys.stderr.getvalue()');
        const fullError = [formattedError, stderr].filter(Boolean).join('\n');

        const executionTime = performance.now() - startTime;
        const executionResult: CodeExecutionResult = {
          output: '',
          error: fullError || pythonError.message || 'Unknown Python error',
          executionTime,
        };
        
        setResult(executionResult);
        return executionResult;
      }

      // Capture output
      const stdout = await pyodide.runPythonAsync('sys.stdout.getvalue()');
      const stderr = await pyodide.runPythonAsync('sys.stderr.getvalue()');

      const executionTime = performance.now() - startTime;

      const executionResult: CodeExecutionResult = {
        output: stdout || '',
        error: stderr || null,
        executionTime,
      };

      setResult(executionResult);
      return executionResult;
    } catch (error: any) {
      // JavaScript/Pyodide loading errors
      const executionTime = performance.now() - startTime;
      
      // Build detailed error message
      let errorMessage = '';
      
      if (error.name) {
        errorMessage += `${error.name}: `;
      }
      
      if (error.message) {
        errorMessage += error.message;
      } else {
        errorMessage = 'Unknown error occurred';
      }
      
      // Add stack trace if available
      if (error.stack) {
        errorMessage += '\n\nStack Trace:\n' + error.stack;
      }

      const executionResult: CodeExecutionResult = {
        output: '',
        error: errorMessage,
        executionTime,
      };

      setResult(executionResult);
      return executionResult;
    } finally {
      setIsLoading(false);
    }
  };

  const clearResult = () => {
    setResult(null);
  };

  return {
    runCode,
    clearResult,
    isLoading,
    result,
  };
}
