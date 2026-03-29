import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';

type AxiosLike = { response?: { data?: { detail?: string } }; message?: string };
const errMsg = (e: unknown, fallback: string) =>
  ((e as AxiosLike)?.response?.data?.detail) || ((e as AxiosLike)?.message) || fallback;

interface StudentQuestion {
  id: string;
  text: string;
  questionNumber: number;
  questionType: string;
  difficulty: string;
  topic: string;
  timeLimit?: number | null;
  createdAt: string;
}

interface EditState {
  text: string;
  timeLimit: string;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'bg-green-900/40 text-green-300 border-green-700',
  medium: 'bg-yellow-900/40 text-yellow-300 border-yellow-700',
  hard: 'bg-red-900/40 text-red-300 border-red-700',
};

const TYPE_COLORS: Record<string, string> = {
  manual: 'bg-purple-900/40 text-purple-300 border-purple-700',
  specific: 'bg-blue-900/40 text-blue-300 border-blue-700',
  general: 'bg-slate-600/40 text-slate-300 border-slate-600',
};

export default function QuestionEditor() {
  const { assessmentId, studentId } = useParams<{ assessmentId: string; studentId: string }>();
  const navigate = useNavigate();

  const [questions, setQuestions] = useState<StudentQuestion[]>([]);
  const [assessment, setAssessment] = useState<{ status: string; title?: string } | null>(null);
  const [studentName, setStudentName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ text: '', timeLimit: '' });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({
    text: '',
    questionType: 'manual',
    difficulty: 'medium',
    topic: 'general',
    timeLimit: '',
  });
  const [adding, setAdding] = useState(false);

  const isLocked = assessment != null && ['active', 'completed'].includes(assessment.status);

  useEffect(() => {
    if (assessmentId && studentId) {
      loadData();
    }
  }, [assessmentId, studentId]);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [asmtResp, qResp, studentsResp] = await Promise.all([
        apiService.getAssessment(assessmentId!),
        apiService.listStudentQuestions(assessmentId!, studentId!),
        apiService.getAssessmentStudents(assessmentId!),
      ]);
      setAssessment(asmtResp);
      setQuestions(qResp.questions || []);
      const student = (studentsResp || []).find((s) => s.studentId === studentId);
      setStudentName(student?.name || studentId || '');
    } catch (e: unknown) {
      setError(errMsg(e, 'Failed to load questions'));
    } finally {
      setIsLoading(false);
    }
  };

  const startEdit = (q: StudentQuestion) => {
    setEditingId(q.id);
    setEditState({ text: q.text, timeLimit: q.timeLimit != null ? String(q.timeLimit) : '' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditState({ text: '', timeLimit: '' });
  };

  const saveEdit = async (questionId: string) => {
    if (!editState.text.trim() || editState.text.trim().length < 10) {
      setError('Question text must be at least 10 characters');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const parsed = editState.timeLimit.trim() !== '' ? parseInt(editState.timeLimit, 10) : NaN;
      const currentQ = questions.find(q => q.id === questionId);
      const tl = !isNaN(parsed) ? parsed : (currentQ?.timeLimit ?? null);
      const resp = await apiService.updateStudentQuestion(
        assessmentId!,
        studentId!,
        questionId,
        editState.text.trim(),
        tl
      );
      setQuestions((prev) =>
        prev.map((q) => (q.id === questionId ? resp.question : q))
      );
      setEditingId(null);
    } catch (e: unknown) {
      setError(errMsg(e, 'Failed to save'));
    } finally {
      setSaving(false);
    }
  };

  const deleteQuestion = async (questionId: string) => {
    if (!confirm('Delete this question?')) return;
    setDeletingId(questionId);
    setError(null);
    try {
      await apiService.deleteStudentQuestion(assessmentId!, studentId!, questionId);
      setQuestions((prev) => prev.filter((q) => q.id !== questionId));
    } catch (e: unknown) {
      setError(errMsg(e, 'Failed to delete'));
    } finally {
      setDeletingId(null);
    }
  };

  const addQuestion = async () => {
    if (!addForm.text.trim() || addForm.text.trim().length < 10) {
      setError('Question text must be at least 10 characters');
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const tl = addForm.timeLimit ? parseInt(addForm.timeLimit, 10) : null;
      const resp = await apiService.addStudentQuestion(assessmentId!, studentId!, {
        text: addForm.text.trim(),
        questionType: addForm.questionType,
        difficulty: addForm.difficulty,
        topic: addForm.topic,
        timeLimit: tl,
      });
      setQuestions((prev) => [...prev, resp.question]);
      setAddForm({ text: '', questionType: 'manual', difficulty: 'medium', topic: 'general', timeLimit: '' });
      setShowAddForm(false);
    } catch (e: unknown) {
      setError(errMsg(e, 'Failed to add question'));
    } finally {
      setAdding(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400">Loading questions…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <button
              onClick={() => navigate(-1)}
              className="text-sm text-slate-400 hover:text-slate-200 mb-1 flex items-center gap-1"
            >
              ← Back
            </button>
            <h1 className="text-xl font-bold">Question Editor</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              {assessment?.title} · {studentName}
            </p>
          </div>
          {isLocked && (
            <span className="px-3 py-1 bg-orange-900/40 border border-orange-700 text-orange-300 text-xs rounded-full">
              Locked — assessment is {assessment?.status}
            </span>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-4">
        {error && (
          <div className="p-3 bg-red-900/40 border border-red-700 text-red-300 rounded-lg text-sm flex justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200">✕</button>
          </div>
        )}

        {/* Question list */}
        {questions.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            No questions generated yet for this student.
          </div>
        )}

        {questions.map((q) => (
          <div
            key={q.id}
            className="bg-slate-800 border border-slate-700 rounded-lg p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1">
                <span className="text-slate-400 font-mono text-sm mt-0.5 min-w-[2rem]">
                  Q{q.questionNumber}
                </span>
                <div className="flex-1">
                  {editingId === q.id ? (
                    <div className="space-y-3">
                      <textarea
                        value={editState.text}
                        onChange={(e) => setEditState((s) => ({ ...s, text: e.target.value }))}
                        rows={4}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-100 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 focus:outline-none resize-y"
                      />
                      <p className="text-xs text-slate-500">Minimum 10 characters to ensure questions are descriptive enough for students.</p>
                      <div className="flex items-center gap-3">
                        <label className="text-xs text-slate-400">Time limit (min)</label>
                        <input
                          type="number"
                          min={1}
                          max={30}
                          value={editState.timeLimit}
                          onChange={(e) => setEditState((s) => ({ ...s, timeLimit: e.target.value }))}
                          placeholder="inherit"
                          className="w-24 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-slate-100 text-sm focus:outline-none"
                        />
                        <div className="flex gap-2 ml-auto">
                          <button
                            onClick={() => saveEdit(q.id)}
                            disabled={saving}
                            className="px-3 py-1.5 bg-primary-600 text-white text-xs rounded hover:bg-primary-700 disabled:opacity-50"
                          >
                            {saving ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="px-3 py-1.5 bg-slate-700 text-slate-200 text-xs rounded hover:bg-slate-600"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-200 leading-relaxed">{q.text}</p>
                  )}

                  {editingId !== q.id && (
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className={`px-2 py-0.5 text-xs border rounded ${TYPE_COLORS[q.questionType] || TYPE_COLORS['general']}`}>
                        {q.questionType}
                      </span>
                      <span className={`px-2 py-0.5 text-xs border rounded ${DIFFICULTY_COLORS[q.difficulty] || DIFFICULTY_COLORS['medium']}`}>
                        {q.difficulty}
                      </span>
                      {q.topic && q.topic !== 'general' && (
                        <span className="px-2 py-0.5 text-xs bg-slate-700 text-slate-300 border border-slate-600 rounded">
                          {q.topic}
                        </span>
                      )}
                      {q.timeLimit != null && (
                        <span className="px-2 py-0.5 text-xs text-slate-400">
                          ⏱ {q.timeLimit}m
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {!isLocked && editingId !== q.id && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => startEdit(q)}
                    className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors"
                    title="Edit question"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => deleteQuestion(q.id)}
                    disabled={deletingId === q.id || questions.length <= 1}
                    className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title={questions.length <= 1 ? 'Cannot delete last question' : 'Delete question'}
                  >
                    {deletingId === q.id ? (
                      <span className="text-xs">…</span>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Add question */}
        {!isLocked && (
          showAddForm ? (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-5 space-y-4">
              <h3 className="text-sm font-medium text-slate-200">Add Question</h3>
              <textarea
                value={addForm.text}
                onChange={(e) => setAddForm((s) => ({ ...s, text: e.target.value }))}
                rows={4}
                placeholder="Enter question text (min 10 characters)…"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-100 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 focus:outline-none resize-y"
              />
              <p className="text-xs text-slate-500">Minimum 10 characters to ensure questions are descriptive enough for students.</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Type</label>
                  <select
                    value={addForm.questionType}
                    onChange={(e) => setAddForm((s) => ({ ...s, questionType: e.target.value }))}
                    className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-slate-100 text-sm focus:outline-none"
                  >
                    <option value="manual">manual</option>
                    <option value="specific">specific</option>
                    <option value="general">general</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Difficulty</label>
                  <select
                    value={addForm.difficulty}
                    onChange={(e) => setAddForm((s) => ({ ...s, difficulty: e.target.value }))}
                    className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-slate-100 text-sm focus:outline-none"
                  >
                    <option value="easy">easy</option>
                    <option value="medium">medium</option>
                    <option value="hard">hard</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Time limit (min)</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={addForm.timeLimit}
                    onChange={(e) => setAddForm((s) => ({ ...s, timeLimit: e.target.value }))}
                    placeholder="inherit"
                    className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-slate-100 text-sm focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Topic</label>
                <input
                  type="text"
                  value={addForm.topic}
                  onChange={(e) => setAddForm((s) => ({ ...s, topic: e.target.value }))}
                  placeholder="e.g. data structures, algorithms…"
                  className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-slate-100 text-sm focus:outline-none"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowAddForm(false); setAddForm({ text: '', questionType: 'manual', difficulty: 'medium', topic: 'general', timeLimit: '' }); }}
                  className="px-4 py-2 bg-slate-700 text-slate-200 text-sm rounded hover:bg-slate-600"
                >
                  Cancel
                </button>
                <button
                  onClick={addQuestion}
                  disabled={adding}
                  className="px-4 py-2 bg-primary-600 text-white text-sm rounded hover:bg-primary-700 disabled:opacity-50"
                >
                  {adding ? 'Adding…' : 'Add Question'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full py-3 border-2 border-dashed border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300 rounded-lg text-sm transition-colors"
            >
              + Add Question for This Student
            </button>
          )
        )}
      </main>
    </div>
  );
}
