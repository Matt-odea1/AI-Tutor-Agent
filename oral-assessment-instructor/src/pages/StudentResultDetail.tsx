import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiService } from '../services/api';

interface ProctorChunk {
  chunkIndex: number;
  chunkUrl: string;
  recordedAt?: string;
}

interface ProctorHealth {
  totalChunks: number;
  missingIndexes: number[];
  chunks: ProctorChunk[];
}

interface QuestionDetail {
  questionId: string;
  questionText: string;
  answerType?: string;
  audioUrl?: string;
  videoUrl?: string;
  textContent?: string;
  duration?: number;
  transcript?: string;
  transcriptStatus?: string;
  aiScore?: number;
  instructorScore?: number;
  effectiveScore?: number;
  maxScore: number;
  feedback?: string;
  strengths?: string;
  improvements?: string;
  instructorComment?: string;
  evaluatedAt?: string;
}

interface StudentDetail {
  studentId: string;
  studentName: string;
  studentEmail: string;
  assessmentId: string;
  totalScore: number;
  maxScore: number;
  percentage: number;
  grade: string;
  submittedAt?: string;
  questions: QuestionDetail[];
  proctoring: ProctorHealth;
}

export default function StudentResultDetail() {
  const { assessmentId, studentId } = useParams<{ assessmentId: string; studentId: string }>();
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overrideStates, setOverrideStates] = useState<Record<string, { score: string; comment: string; saving: boolean; scoreError?: string }>>({});
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);

  useEffect(() => {
    if (assessmentId && studentId) loadDetail();
  }, [assessmentId, studentId]);

  const loadDetail = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiService.getStudentDetail(assessmentId!, studentId!);
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load student detail');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOverride = async (questionId: string, maxScore: number) => {
    const state = overrideStates[questionId];
    if (!state) return;
    const trimmed = state.score.trim();
    if (trimmed === '' || !/^\d+$/.test(trimmed)) {
      setOverrideStates(prev => ({ ...prev, [questionId]: { ...prev[questionId], scoreError: 'Score must be a number' } }));
      return;
    }
    const score = parseInt(trimmed, 10);
    if (score < 0 || score > maxScore) {
      setOverrideStates(prev => ({ ...prev, [questionId]: { ...prev[questionId], scoreError: `Score must be between 0 and ${maxScore}` } }));
      return;
    }

    setOverrideStates(prev => ({ ...prev, [questionId]: { ...prev[questionId], saving: true } }));
    try {
      await apiService.overrideScore(assessmentId!, studentId!, questionId, score, state.comment || undefined);
      await loadDetail();
      setOverrideStates(prev => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save override');
    } finally {
      setOverrideStates(prev => ({ ...prev, [questionId]: { ...prev[questionId], saving: false } }));
    }
  };

  const initOverride = (q: QuestionDetail) => {
    setOverrideStates(prev => ({
      ...prev,
      [q.questionId]: {
        score: String(q.instructorScore ?? q.aiScore ?? ''),
        comment: q.instructorComment ?? '',
        saving: false,
      },
    }));
  };

  const gradeBadge = (grade: string) => {
    const map: Record<string, string> = {
      Excellent: 'bg-green-600 text-white',
      Competent: 'bg-blue-600 text-white',
      Developing: 'bg-yellow-600 text-white',
      Unsatisfactory: 'bg-red-600 text-white',
    };
    return map[grade] ?? 'bg-gray-200 text-gray-700';
  };

  if (isLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-red-900/20 border border-red-500 rounded-lg p-6 max-w-md">
        <p className="text-red-400">{error}</p>
        <button onClick={loadDetail} className="mt-3 text-sm text-red-300 underline">Retry</button>
      </div>
    </div>
  );

  if (!detail) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link to={`/assessments/${assessmentId}/results`} className="text-gray-500 hover:text-gray-600 text-sm">
            ← Back to Results
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">{detail.studentName}</h1>
          <p className="text-gray-500 text-sm">{detail.studentEmail} · {detail.studentId}</p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Score Summary */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-xs text-gray-500 mb-1">Score</div>
            <div className="text-2xl font-bold text-gray-900">{detail.totalScore} / {detail.maxScore}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-xs text-gray-500 mb-1">Percentage</div>
            <div className="text-2xl font-bold text-gray-900">{detail.percentage}%</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-xs text-gray-500 mb-1">Grade</div>
            <span className={`px-2.5 py-1 rounded-full text-sm font-medium ${gradeBadge(detail.grade)}`}>{detail.grade}</span>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-xs text-gray-500 mb-1">Submitted</div>
            <div className="text-sm text-gray-600">{detail.submittedAt ? new Date(detail.submittedAt).toLocaleString() : '—'}</div>
          </div>
        </div>

        {/* Questions */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Question Results</h2>
          {detail.questions.map((q, i) => {
            const override = overrideStates[q.questionId];
            const isExpanded = expandedQuestion === q.questionId;
            return (
              <div key={q.questionId} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <button
                  className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedQuestion(isExpanded ? null : q.questionId)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 font-medium">Q{i + 1}</span>
                    {q.answerType && <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">{q.answerType}</span>}
                    <p className="text-sm text-gray-700 line-clamp-1">{q.questionText}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {q.instructorScore !== null && q.instructorScore !== undefined && (
                      <span className="text-xs text-yellow-400">override</span>
                    )}
                    <span className="text-sm font-semibold text-gray-900">
                      {q.effectiveScore ?? '—'} / {q.maxScore}
                    </span>
                    <svg className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-200 p-4 space-y-4">
                    {/* Question text */}
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Question</p>
                      <p className="text-sm text-gray-700">{q.questionText}</p>
                    </div>

                    {/* Transcript */}
                    {q.transcript && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Transcript
                          {q.transcriptStatus && <span className="ml-2 text-gray-400">({q.transcriptStatus})</span>}
                        </p>
                        <p className="text-sm text-gray-600 italic bg-gray-50/50 rounded p-2">{q.transcript}</p>
                      </div>
                    )}

                    {/* Text answer */}
                    {q.textContent && !q.transcript && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Written Answer</p>
                        <p className="text-sm text-gray-600 bg-gray-50/50 rounded p-2">{q.textContent}</p>
                      </div>
                    )}

                    {/* Audio playback */}
                    {q.audioUrl && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Audio Recording</p>
                        <audio controls src={q.audioUrl} className="w-full" />
                      </div>
                    )}

                    {/* Video playback */}
                    {q.videoUrl && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Video Recording</p>
                        <video controls src={q.videoUrl} className="w-full max-h-48 rounded" />
                      </div>
                    )}

                    {/* AI scores */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-gray-50/50 rounded p-3 text-center">
                        <div className="text-lg font-bold text-gray-900">{q.aiScore ?? '—'}</div>
                        <div className="text-xs text-gray-500">AI Score</div>
                      </div>
                      <div className="bg-gray-50/50 rounded p-3 text-center">
                        <div className="text-lg font-bold text-yellow-400">{q.instructorScore ?? '—'}</div>
                        <div className="text-xs text-gray-500">Override</div>
                      </div>
                      <div className="bg-gray-50/50 rounded p-3 text-center">
                        <div className="text-lg font-bold text-green-400">{q.effectiveScore ?? '—'} / {q.maxScore}</div>
                        <div className="text-xs text-gray-500">Effective</div>
                      </div>
                    </div>

                    {/* AI feedback */}
                    {q.feedback && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">AI Feedback</p>
                        <p className="text-sm text-gray-600">{q.feedback}</p>
                      </div>
                    )}
                    {q.strengths && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Strengths</p>
                        <p className="text-sm text-gray-600">{q.strengths}</p>
                      </div>
                    )}
                    {q.improvements && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Improvements</p>
                        <p className="text-sm text-gray-600">{q.improvements}</p>
                      </div>
                    )}

                    {/* Score override form */}
                    <div className="border-t border-gray-200 pt-3">
                      <p className="text-xs font-medium text-gray-600 mb-2">Override Score</p>
                      {override ? (
                        <div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            max={q.maxScore}
                            value={override.score}
                            onChange={e => setOverrideStates(prev => ({ ...prev, [q.questionId]: { ...prev[q.questionId], score: e.target.value, scoreError: undefined } }))}
                            className={`w-20 px-2 py-1 bg-gray-100 border rounded text-gray-900 text-sm ${override.scoreError ? 'border-red-500' : 'border-gray-300'}`}
                            placeholder={`0-${q.maxScore}`}
                          />
                          <input
                            type="text"
                            value={override.comment}
                            onChange={e => setOverrideStates(prev => ({ ...prev, [q.questionId]: { ...prev[q.questionId], comment: e.target.value } }))}
                            className="flex-1 px-2 py-1 bg-gray-100 border border-gray-300 rounded text-gray-900 text-sm"
                            placeholder="Optional comment..."
                          />
                          <button
                            onClick={() => handleOverride(q.questionId, q.maxScore)}
                            disabled={override.saving}
                            className="px-3 py-1 bg-primary-600 text-white text-sm rounded hover:bg-primary-700 disabled:opacity-50"
                          >
                            {override.saving ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            onClick={() => setOverrideStates(prev => { const n = { ...prev }; delete n[q.questionId]; return n; })}
                            className="px-3 py-1 bg-gray-100 text-gray-600 text-sm rounded hover:bg-gray-200"
                          >
                            Cancel
                          </button>
                        </div>
                        {override.scoreError && <p className="mt-1 text-xs text-red-400">{override.scoreError}</p>}
                        </div>
                      ) : (
                        <button
                          onClick={() => initOverride(q)}
                          className="px-3 py-1 bg-gray-100 text-gray-600 text-sm rounded hover:bg-gray-200"
                        >
                          {q.instructorScore !== null && q.instructorScore !== undefined ? 'Edit Override' : 'Set Override'}
                        </button>
                      )}
                      {q.instructorComment && !override && (
                        <p className="mt-1 text-xs text-gray-500">Comment: {q.instructorComment}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Proctoring chunk health */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Proctoring Footage</h2>
          <div className="flex items-center gap-6 mb-3">
            <div>
              <span className="text-xs text-gray-500">Chunks uploaded</span>
              <div className="text-lg font-bold text-gray-900">{detail.proctoring.totalChunks}</div>
            </div>
            <div>
              <span className="text-xs text-gray-500">Missing chunks</span>
              <div className={`text-lg font-bold ${detail.proctoring.missingIndexes.length > 0 ? 'text-red-400' : 'text-green-400'}`}>
                {detail.proctoring.missingIndexes.length}
              </div>
            </div>
          </div>
          {detail.proctoring.missingIndexes.length > 0 && (
            <p className="text-xs text-red-400">Missing chunk indexes: {detail.proctoring.missingIndexes.join(', ')}</p>
          )}
          {detail.proctoring.totalChunks === 0 && (
            <p className="text-xs text-gray-400">No proctoring chunks uploaded for this student.</p>
          )}
          {detail.proctoring.chunks.length > 0 && (
            <div className="mt-3 max-h-40 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500">
                    <th className="text-left py-1">Chunk #</th>
                    <th className="text-left py-1">Recorded At</th>
                    <th className="text-left py-1">URL</th>
                  </tr>
                </thead>
                <tbody className="text-gray-600">
                  {detail.proctoring.chunks.map(c => (
                    <tr key={c.chunkIndex}>
                      <td className="py-0.5">{c.chunkIndex}</td>
                      <td className="py-0.5">{c.recordedAt ? new Date(c.recordedAt).toLocaleTimeString() : '—'}</td>
                      <td className="py-0.5 truncate max-w-xs"><a href={c.chunkUrl} target="_blank" rel="noreferrer" className="text-primary-400 hover:underline">view</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
