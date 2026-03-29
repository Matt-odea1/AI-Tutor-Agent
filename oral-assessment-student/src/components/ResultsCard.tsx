/**
 * ResultsCard - Display evaluation results for a single question
 */

import { useState } from 'react';
import type { QuestionResult } from '../types';

interface ResultsCardProps {
  result: QuestionResult;
}

export default function ResultsCard({ result }: ResultsCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const scorePercentage = Math.round((result.totalScore / (result.maxScore ?? 10)) * 100);
  const scoreColor =
    scorePercentage >= 90
      ? 'text-green-600 bg-green-100'
      : scorePercentage >= 70
      ? 'text-blue-600 bg-blue-100'
      : scorePercentage >= 50
      ? 'text-yellow-600 bg-yellow-100'
      : 'text-red-600 bg-red-100';

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      {/* Header */}
      <div
        className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <span className="text-sm font-medium text-gray-500">
              Question {result.questionNumber}
            </span>
            <p className="mt-1 text-sm text-gray-700 line-clamp-2">
              {result.questionText}
            </p>
          </div>

          <div className="flex items-center space-x-4">
            {/* Score Badge */}
            <div className={`px-4 py-2 rounded-lg font-semibold ${scoreColor}`}>
              {scorePercentage}%
            </div>

            {/* Expand Icon */}
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${
                isExpanded ? 'rotate-180' : ''
              }`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-gray-200 p-6 bg-gray-50">
          {/* Score Breakdown */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary-600">
                {result.correctnessScore}
              </div>
              <div className="text-xs text-gray-600">Correctness</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {result.understandingScore}
              </div>
              <div className="text-xs text-gray-600">Understanding</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {result.totalScore}
              </div>
              <div className="text-xs text-gray-600">Total</div>
            </div>
          </div>

          {/* Feedback */}
          {result.feedback && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Feedback
              </h4>
              <p className="text-sm text-gray-700 leading-relaxed">
                {result.feedback}
              </p>
            </div>
          )}

          {/* Strengths */}
          {result.strengths && result.strengths.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Strengths
              </h4>
              <ul className="space-y-1">
                {result.strengths.map((strength, index) => (
                  <li key={index} className="flex items-start text-sm">
                    <svg
                      className="w-4 h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-gray-700">{strength}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Weaknesses */}
          {result.weaknesses && result.weaknesses.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Areas for Improvement
              </h4>
              <ul className="space-y-1">
                {result.weaknesses.map((weakness, index) => (
                  <li key={index} className="flex items-start text-sm">
                    <svg
                      className="w-4 h-4 text-red-500 mr-2 mt-0.5 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-gray-700">{weakness}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Suggested Improvements */}
          {result.suggestedImprovements && result.suggestedImprovements.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Suggested Improvements
              </h4>
              <ul className="space-y-1">
                {result.suggestedImprovements.map((suggestion, index) => (
                  <li key={index} className="flex items-start text-sm">
                    <svg
                      className="w-4 h-4 text-primary-500 mr-2 mt-0.5 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-gray-700">{suggestion}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Transcript */}
          {result.transcript && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Transcript
              </h4>
              <div className="p-3 bg-white rounded-lg border border-gray-200">
                <p className="text-sm text-gray-700 italic">
                  {result.transcript}
                </p>
              </div>
            </div>
          )}

          {/* Audio Playback */}
          {result.audioUrl && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Your Recording
              </h4>
              <audio
                controls
                src={result.audioUrl}
                className="w-full"
              >
                Your browser does not support audio playback.
              </audio>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
