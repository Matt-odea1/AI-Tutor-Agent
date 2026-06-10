/**
 * ResultsCard - Display evaluation results for a single question.
 *
 * Renders feedback as Markdown (matching QuestionDisplay), shows sub-scores with
 * their denominators, plays back the recording with a seekable wavesurfer
 * waveform, and renders a per-question status badge (graded / skipped /
 * not-attempted / grading-failed) so an ungraded question never shows a
 * misleading red 0%.
 */

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css';
import WaveSurfer from 'wavesurfer.js';
import type { QuestionResult } from '../types';
import {
  deriveResultStatus,
  totalMaxFor,
  componentMaxFor,
  scorePercent,
  statusBadgeFor,
  TIME_EXPIRED_SENTINEL,
} from '../utils/resultHelpers';

interface ResultsCardProps {
  result: QuestionResult;
}

/** Inline-friendly Markdown renderer reusing QuestionDisplay's plugin set. */
function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{children}</ReactMarkdown>
    </div>
  );
}

/** Seekable waveform player for the student's recording (replaces bare <audio>). */
function AudioPlayer({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioError, setAudioError] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;

    const ws = WaveSurfer.create({
      container: el,
      height: 48,
      waveColor: '#c6a5e7', // primary-300
      progressColor: '#7a3f9b', // primary-600
      cursorColor: '#562b6f', // primary-800
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
    });
    wsRef.current = ws;

    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));
    ws.on('finish', () => setIsPlaying(false));
    // Presigned S3 URLs expire; surface a clear message instead of failing silently.
    ws.on('error', () => {
      if (!cancelled) setAudioError(true);
    });
    ws.load(url).catch(() => {
      if (!cancelled) setAudioError(true);
    });

    return () => {
      cancelled = true;
      try {
        ws.destroy();
      } catch {
        /* ignore teardown races (e.g. aborted load) */
      }
      wsRef.current = null;
    };
  }, [url]);

  if (audioError) {
    return (
      <p className="text-sm text-gray-500 italic" role="status">
        This recording link has expired. Reload the page to refresh it.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => wsRef.current?.playPause()}
        aria-label={isPlaying ? 'Pause recording' : 'Play recording'}
        className="flex-shrink-0 w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center hover:bg-primary-700 transition-colors"
      >
        {isPlaying ? (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M6 4h3v12H6V4zm5 0h3v12h-3V4z" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M6 4l10 6-10 6V4z" />
          </svg>
        )}
      </button>
      <div ref={containerRef} className="flex-1 min-w-0" />
    </div>
  );
}

export default function ResultsCard({ result }: ResultsCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const status = deriveResultStatus(result);
  const totalMax = totalMaxFor(result);
  const componentMax = componentMaxFor(result);
  const percentage =
    status === 'graded' && result.totalScore != null
      ? scorePercent(result.totalScore, totalMax)
      : null;
  const badge = statusBadgeFor(status, percentage);

  // Never render the skip sentinel as if it were a real transcript.
  const showTranscript =
    !!result.transcript && result.transcript.trim() !== TIME_EXPIRED_SENTINEL;
  // Recording is only meaningful when the student actually answered.
  const showAudio = !!result.audioUrl && (status === 'graded' || status === 'grading-failed');
  const showFeedback = !!result.feedback && (status === 'graded' || status === 'grading-failed');

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
            {/* Status / Score Badge */}
            <div className={`px-4 py-2 rounded-lg font-semibold whitespace-nowrap ${badge.className}`}>
              {badge.label}
            </div>

            {/* Expand Icon */}
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${
                isExpanded ? 'rotate-180' : ''
              }`}
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
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
          {/* Score Breakdown (graded only) */}
          {status === 'graded' && (
            <>
              <div className="grid grid-cols-3 gap-4 mb-2">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary-600">
                    {result.correctnessScore}
                    <span className="text-base font-medium text-gray-400"> / {componentMax}</span>
                  </div>
                  <div className="text-xs text-gray-600">Correctness</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {result.understandingScore}
                    <span className="text-base font-medium text-gray-400"> / {componentMax}</span>
                  </div>
                  <div className="text-xs text-gray-600">Understanding</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {result.totalScore}
                    <span className="text-base font-medium text-gray-400"> / {totalMax}</span>
                  </div>
                  <div className="text-xs text-gray-600">Total</div>
                </div>
              </div>
              <p className="text-xs text-gray-400 text-center mb-6">
                Scores shown as points earned / points possible.
              </p>
            </>
          )}

          {/* Non-graded status notices */}
          {status === 'skipped' && (
            <div className="mb-4 p-3 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-600">
              You skipped this question — no answer was recorded.
            </div>
          )}
          {status === 'not-attempted' && (
            <div className="mb-4 p-3 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-600">
              This question was not attempted.
            </div>
          )}
          {status === 'grading-failed' && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              This question couldn't be automatically graded. Please contact your instructor if you
              have questions about it.
            </div>
          )}

          {/* Feedback */}
          {showFeedback && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Feedback</h4>
              <Markdown className="prose prose-sm max-w-none text-gray-700">
                {result.feedback}
              </Markdown>
            </div>
          )}

          {/* Strengths */}
          {status === 'graded' && result.strengths && result.strengths.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Strengths</h4>
              <ul className="space-y-1">
                {result.strengths.map((strength, index) => (
                  <li key={index} className="flex items-start text-sm">
                    <svg
                      className="w-4 h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <Markdown className="prose prose-sm max-w-none text-gray-700 [&_p]:m-0">
                      {strength}
                    </Markdown>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Weaknesses */}
          {status === 'graded' && result.weaknesses && result.weaknesses.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Areas for Improvement</h4>
              <ul className="space-y-1">
                {result.weaknesses.map((weakness, index) => (
                  <li key={index} className="flex items-start text-sm">
                    <svg
                      className="w-4 h-4 text-red-500 mr-2 mt-0.5 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <Markdown className="prose prose-sm max-w-none text-gray-700 [&_p]:m-0">
                      {weakness}
                    </Markdown>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Suggested Improvements */}
          {status === 'graded' &&
            result.suggestedImprovements &&
            result.suggestedImprovements.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Suggested Improvements</h4>
                <ul className="space-y-1">
                  {result.suggestedImprovements.map((suggestion, index) => (
                    <li key={index} className="flex items-start text-sm">
                      <svg
                        className="w-4 h-4 text-primary-500 mr-2 mt-0.5 flex-shrink-0"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <Markdown className="prose prose-sm max-w-none text-gray-700 [&_p]:m-0">
                        {suggestion}
                      </Markdown>
                    </li>
                  ))}
                </ul>
              </div>
            )}

          {/* Transcript */}
          {showTranscript && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Transcript</h4>
              <div className="p-3 bg-white rounded-lg border border-gray-200">
                <p className="text-sm text-gray-700 italic">{result.transcript}</p>
              </div>
            </div>
          )}

          {/* Audio Playback */}
          {showAudio && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Your Recording</h4>
              {/* key on url so a refreshed presigned link remounts with clean state */}
              <AudioPlayer key={result.audioUrl} url={result.audioUrl} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
