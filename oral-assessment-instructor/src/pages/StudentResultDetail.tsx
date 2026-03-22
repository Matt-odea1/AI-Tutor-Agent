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
  const [overrideStates, setOverrideStates] = useState<Record<string, { score: string; comment: string; saving: boolean }>>({});
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
    const score = parseInt(state.score);
    if (isNaN(score) || score < 0 || score > maxScore) return;

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
    return map[grade] ?? 'bg-slate-600 text-slate-200';
  };

  if (isLoading) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="bg-red-900/20 border border-red-500 rounded-lg p-6 max-w-md">
        <p className="text-red-400">{error}</p>
        <button onClick={loadDetail} className="mt-3 text-sm text-red-300 underline">Retry</button>
      </div>
    </div>
  );

  if (!detail) return null;

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link to={`/assessments/${assessmentId}/results`} className="text-slate-400 hover:text-slate-300 text-sm">
            ← Back to Results
          </Link>
          <h1 className="text-2xl font-bold text-slate-100 mt-2">{detail.studentName}</h1>
          <p className="text-slate-400 text-sm">{detail.studentEmail} · {detail.studentId}</p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Score Summary */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="text-xs text-slate-400 mb-1">Score</div>
            <div className="text-2xl font-bold text-slate-100">{detail.totalScore} / {detail.maxScore}</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="text-xs text-slate-400 mb-1">Percentage</div>
            <div className="text-2xl font-bold text-slate-100">{detail.percentage}%</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="text-xs text-slate-400 mb-1">Grade</div>
            <span className={`px-2.5 py-1 rounded-full text-sm font-medium ${gradeBadge(detail.grade)}`}>{detail.grade}</span>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="text-xs text-slate-400 mb-1">Submitted</div>
            <div className="text-sm text-slate-300">{detail.submittedAt ? new Date(detail.submittedAt).toLocaleString() : '—'}</div>
          </div>
        </div>

        {/* Questions */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-100">Question Results</h2>
          {detail.questions.map((q, i) => {
            const override = overrideStates[q.questionId];
            const isExpanded = expandedQuestion === q.questionId;
            return (
              <div key={q.questionId} className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                <button
                  className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-750 transition-colors"
                  onClick={() => setExpandedQuestion(isExpanded ? null : q.questionId)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 font-medium">Q{i + 1}</span>
                    {q.answerType && <span className="px-2 py-0.5 text-xs bg-slate-700 text-slate-300 rounded">{q.answerType}</span>}
                    <p className="text-sm text-slate-200 line-clamp-1">{q.questionText}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {q.instructorScore !== null && q.instructorScore !== undefined && (
                      <span className="text-xs text-yellow-400">override</span>
                    )}
                    <span className="text-sm font-semibold text-slate-100">
                      {q.effectiveScore ?? '—'} / {q.maxScore}
                    </span>
                    <svg className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-700 p-4 space-y-4">
                    {/* Question text */}
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Question</p>
                      <p className="text-sm text-slate-200">{q.questionText}</p>
                    </div>

                    {/* Transcript */}
                    {q.transcript && (
                      <div>
                        <p className="text-xs text-slate-400 mb-1">Transcript
                          {q.transcriptStatus && <span className="ml-2 text-slate-500">({q.transcriptStatus})</span>}
                        </p>
                        <p className="text-sm text-slate-300 italic bg-slate-900/50 rounded p-2">{q.transcript}</p>
                      </div>
                    )}

                    {/* Text answer */}
                    {q.textContent && !q.transcript && (
                      <div>
                        <p className="text-xs text-slate-400 mb-1">Written Answer</p>
                        <p className="text-sm text-slate-300 bg-slate-900/50 rounded p-2">{q.textContent}</p>
                      </div>
                    )}

                    {/* Audio playback */}
                    {q.audioUrl && (
                      <div>
                        <p className="text-xs text-slate-400 mb-1">Audio Recording</p>
                        <audio controls src={q.audioUrl} className="w-full" />
                      </div>
                    )}

                    {/* Video playback */}
                    {q.videoUrl && (
                      <div>
                        <p className="text-xs text-slate-400 mb-1">Video Recording</p>
                        <video controls src={q.videoUrl} className="w-full max-h-48 rounded" />
                      </div>
                    )}

                    {/* AI scores */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-slate-900/50 rounded p-3 text-center">
                        <div className="text-lg font-bold text-slate-100">{q.aiScore ?? '—'}</div>
                        <div className="text-xs text-slate-400">AI Score</div>
                      </div>
                      <div className="bg-slate-900/50 rounded p-3 text-center">
                        <div className="text-lg font-bold text-yellow-400">{q.instructorScore ?? '—'}</div>
                        <div className="text-xs text-slate-400">Override</div>
                      </div>
                      <div className="bg-slate-900/50 rounded p-3 text-center">
                        <div className="text-lg font-bold text-green-400">{q.effectiveScore ?? '—'} / {q.maxScore}</div>
                        <div className="text-xs text-slate-400">Effective</div>
                      </div>
                    </div>

                    {/* AI feedback */}
                    {q.feedback && (
                      <div>
                        <p className="text-xs text-slate-400 mb-1">AI Feedback</p>
                        <p className="text-sm text-slate-300">{q.feedback}</p>
                      </div>
                    )}
                    {q.strengths && (
                      <div>
                        <p className="text-xs text-slate-400 mb-1">Strengths</p>
                        <p className="text-sm text-slate-300">{q.strengths}</p>
                      </div>
                    )}
                    {q.improvements && (
                      <div>
                        <p className="text-xs text-slate-400 mb-1">Improvements</p>
                        <p className="text-sm text-slate-300">{q.improvements}</p>
                      </div>
                    )}

                    {/* Score override form */}
                    <div className="border-t border-slate-700 pt-3">
                      <p className="text-xs font-medium text-slate-300 mb-2">Override Score</p>
                      {override ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            max={q.maxScore}
                            value={override.score}
                            onChange={e => setOverrideStates(prev => ({ ...prev, [q.questionId]: { ...prev[q.questionId], score: e.target.value } }))}
                            className="w-20 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-slate-100 text-sm"
                            placeholder={`0-${q.maxScore}`}
                          />
                          <input
                            type="text"
                            value={override.comment}
                            onChange={e => setOverrideStates(prev => ({ ...prev, [q.questionId]: { ...prev[q.questionId], comment: e.target.value } }))}
                            className="flex-1 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-slate-100 text-sm"
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
                            className="px-3 py-1 bg-slate-700 text-slate-300 text-sm rounded hover:bg-slate-600"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => initOverride(q)}
                          className="px-3 py-1 bg-slate-700 text-slate-300 text-sm rounded hover:bg-slate-600"
                        >
                          {q.instructorScore !== null && q.instructorScore !== undefined ? 'Edit Override' : 'Set Override'}
                        </button>
                      )}
                      {q.instructorComment && !override && (
                        <p className="mt-1 text-xs text-slate-400">Comment: {q.instructorComment}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Proctoring chunk health */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <h2 className="text-base font-semibold text-slate-100 mb-3">Proctoring Footage</h2>
          <div className="flex items-center gap-6 mb-3">
            <div>
              <span className="text-xs text-slate-400">Chunks uploaded</span>
              <div className="text-lg font-bold text-slate-100">{detail.proctoring.totalChunks}</div>
            </div>
            <div>
              <span className="text-xs text-slate-400">Missing chunks</span>
              <div className={`text-lg font-bold ${detail.proctoring.missingIndexes.length > 0 ? 'text-red-400' : 'text-green-400'}`}>
                {detail.proctoring.missingIndexes.length}
              </div>
            </div>
          </div>
          {detail.proctoring.missingIndexes.length > 0 && (
            <p className="text-xs text-red-400">Missing chunk indexes: {detail.proctoring.missingIndexes.join(', ')}</p>
          )}
          {detail.proctoring.totalChunks === 0 && (
            <p className="text-xs text-slate-500">No proctoring chunks uploaded for this student.</p>
          )}
          {detail.proctoring.chunks.length > 0 && (
            <div className="mt-3 max-h-40 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400">
                    <th className="text-left py-1">Chunk #</th>
                    <th className="text-left py-1">Recorded At</th>
                    <th className="text-left py-1">URL</th>
                  </tr>
                </thead>
                <tbody className="text-slate-300">
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
