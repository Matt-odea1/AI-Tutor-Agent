/**
 * QuestionDisplay - Displays question text with Markdown and code highlighting
 */

import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css';
import type { Question } from '../types';
import { getDifficultyColor } from '../utils/helpers';

interface QuestionDisplayProps {
  question: Question;
  questionNumber: number;
  totalQuestions: number;
}

export default function QuestionDisplay({
  question,
  questionNumber,
  totalQuestions,
}: QuestionDisplayProps) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <span className="text-sm font-medium text-gray-500">
            Question {questionNumber} of {totalQuestions}
          </span>
          {question.questionType && (
            <span className="px-2 py-1 text-xs font-medium bg-primary-100 text-primary-800 rounded">
              {question.questionType}
            </span>
          )}
          {question.difficulty && (
            <span className={`px-2 py-1 text-xs font-medium rounded ${getDifficultyColor(question.difficulty)}`}>
              {question.difficulty}
            </span>
          )}
        </div>
        {question.topic && (
          <span className="text-xs text-gray-500">
            Topic: {question.topic}
          </span>
        )}
      </div>

      {/* Question Text */}
      <div className="prose prose-sm max-w-none mb-4">
        <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
          {question.text}
        </ReactMarkdown>
      </div>

      {/* Code Context (if present) */}
      {question.codeContext && (
        <div className="mt-4 border-t pt-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">
            Code Context:
          </h4>
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
              {`\`\`\`python\n${question.codeContext}\n\`\`\``}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-4 p-3 bg-primary-50 rounded-lg">
        <p className="text-sm text-primary-800">
          <span className="font-semibold">Instructions:</span> Answer this question using the oral or written
          mode below. Explain your reasoning clearly.
        </p>
      </div>
    </div>
  );
}
