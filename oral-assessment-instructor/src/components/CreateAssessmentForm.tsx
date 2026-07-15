import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { useAssessmentStore } from '../store/assessmentStore';
import type { CreateAssessmentRequest } from '../../../shared/types/assessment';

type AssessmentType = 'proctored-exam' | 'formative-practice' | 'custom';

// Presets only set the behaviour flags; answerMode is chosen independently.
const PRESETS: Record<
  Exclude<AssessmentType, 'custom'>,
  Pick<CreateAssessmentRequest, 'proctored' | 'allowReview' | 'feedbackRelease' | 'autoEvaluate'>
> = {
  // Auto-evaluate on both: the exam scores automatically but you release results
  // manually; formative scores and shows feedback immediately.
  'proctored-exam': { proctored: true, allowReview: false, feedbackRelease: 'manual', autoEvaluate: true },
  'formative-practice': { proctored: false, allowReview: true, feedbackRelease: 'immediate', autoEvaluate: true },
};

export default function CreateAssessmentForm() {
  const navigate = useNavigate();
  const { addAssessment, setSelectedAssessment, setLoading, setError } = useAssessmentStore();

  const [formData, setFormData] = useState<CreateAssessmentRequest>({
    title: '',
    description: '',
    course: '',
    dueDate: '',
    totalQuestions: 8,
    timeLimit: undefined,
    accessMode: 'open',
    scheduledWindowStart: undefined,
    scheduledWindowEnd: undefined,
    answerMode: 'oral',
    preparationTime: 60,
    // Behaviour flags — default to the "Proctored exam" preset, i.e. today's behaviour.
    proctored: true,
    allowReview: false,
    feedbackRelease: 'manual',
    autoEvaluate: true,
  });

  const [errors, setErrors] = useState<Partial<Record<keyof CreateAssessmentRequest | string, string>>>({});
  const [assessmentType, setAssessmentType] = useState<AssessmentType>('proctored-exam');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const initialFormData = useRef(formData);
  const hasSubmitted = useRef(false);

  const applyPreset = (type: AssessmentType) => {
    setAssessmentType(type);
    if (type !== 'custom') {
      setFormData((prev) => ({ ...prev, ...PRESETS[type] }));
    }
  };

  // Editing an individual flag means the config no longer matches a named preset.
  const setFlag = (patch: Partial<CreateAssessmentRequest>) => {
    setFormData((prev) => ({ ...prev, ...patch }));
    setAssessmentType('custom');
  };

  // Warn on unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasSubmitted.current) return;
      const isDirty = JSON.stringify(formData) !== JSON.stringify(initialFormData.current);
      if (isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [formData]);

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof CreateAssessmentRequest, string>> = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (!formData.course.trim()) {
      newErrors.course = 'Course is required';
    }

    if (!formData.dueDate) {
      newErrors.dueDate = 'Due date is required';
    } else {
      const dueDate = new Date(formData.dueDate);
      const today = new Date();
      // Compare date portions only (strip time) so selecting tomorrow never fails
      const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      if (dueDateOnly < todayOnly) {
        newErrors.dueDate = 'Due date must be today or in the future';
      }
    }

    if (formData.totalQuestions < 1 || formData.totalQuestions > 20) {
      newErrors.totalQuestions = 'Total questions must be between 1 and 20';
    }

    if (formData.timeLimit && (formData.timeLimit < 1 || formData.timeLimit > 30)) {
      newErrors.timeLimit = 'Time limit must be between 1 and 30 minutes';
    }

    if (formData.answerMode === 'oral' && formData.preparationTime != null && (formData.preparationTime < 0 || formData.preparationTime > 300)) {
      (newErrors as Record<string, string>).preparationTime = 'Preparation time must be between 0 and 300 seconds';
    }

    if (formData.accessMode === 'scheduled') {
      if (!formData.scheduledWindowStart) {
        newErrors.scheduledWindowStart = 'Window start is required for scheduled access';
      }
      if (!formData.scheduledWindowEnd) {
        newErrors.scheduledWindowEnd = 'Window end is required for scheduled access';
      }
      if (formData.scheduledWindowStart && formData.scheduledWindowEnd) {
        if (new Date(formData.scheduledWindowEnd) <= new Date(formData.scheduledWindowStart)) {
          newErrors.scheduledWindowEnd = 'Window end must be after window start';
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const assessment = await apiService.createAssessment(formData);
      addAssessment(assessment);
      setSelectedAssessment(assessment);

      // Navigate to upload students with success message
      hasSubmitted.current = true;
      navigate(`/assessments/${assessment.id}/upload`, { state: { created: assessment.title } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create assessment');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'totalQuestions'
        ? Number(value)
        : name === 'timeLimit' || name === 'preparationTime'
        ? (value === '' ? undefined : Number(value))
        : value,
    }));

    // Clear error for this field
    if (errors[name as keyof CreateAssessmentRequest]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleAccessModeChange = (mode: 'open' | 'scheduled') => {
    setFormData(prev => ({
      ...prev,
      accessMode: mode,
      scheduledWindowStart: mode === 'open' ? undefined : prev.scheduledWindowStart,
      scheduledWindowEnd: mode === 'open' ? undefined : prev.scheduledWindowEnd,
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      {/* Title */}
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
          Assessment Title *
        </label>
        <input
          type="text"
          id="title"
          name="title"
          value={formData.title}
          onChange={handleChange}
          className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:outline-none"
          placeholder="e.g., Midterm Oral Assessment"
        />
        {errors.title && <p className="mt-1 text-sm text-red-400">{errors.title}</p>}
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          value={formData.description}
          onChange={handleChange}
          rows={3}
          className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none"
          placeholder="Describe the assessment objectives..."
        />
      </div>

      {/* Course */}
      <div>
        <label htmlFor="course" className="block text-sm font-medium text-gray-700 mb-2">
          Course *
        </label>
        <input
          type="text"
          id="course"
          name="course"
          value={formData.course}
          onChange={handleChange}
          className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:outline-none"
          placeholder="e.g., CS 101 - Introduction to Programming"
        />
        {errors.course && <p className="mt-1 text-sm text-red-400">{errors.course}</p>}
      </div>

      {/* Due Date */}
      <div>
        <label htmlFor="dueDate" className="block text-sm font-medium text-gray-700 mb-2">
          Display Deadline *
        </label>
        <input
          type="datetime-local"
          id="dueDate"
          name="dueDate"
          value={formData.dueDate}
          onChange={handleChange}
          className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:outline-none"
        />
        <p className="mt-1 text-sm text-gray-500">
          Shown to students as a reminder — does not enforce access. Use "Scheduled Window" below to restrict when students can open the assessment.
        </p>
        {errors.dueDate && <p className="mt-1 text-sm text-red-400">{errors.dueDate}</p>}
      </div>

      {/* Access Mode */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Student Access
        </label>
        <div className="flex space-x-4">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="radio"
              name="accessMode"
              checked={formData.accessMode === 'open'}
              onChange={() => handleAccessModeChange('open')}
              className="text-primary-600 focus:ring-primary-500"
            />
            <span className="text-gray-700 text-sm font-medium">Open access</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="radio"
              name="accessMode"
              checked={formData.accessMode === 'scheduled'}
              onChange={() => handleAccessModeChange('scheduled')}
              className="text-primary-600 focus:ring-primary-500"
            />
            <span className="text-gray-700 text-sm font-medium">Scheduled window</span>
          </label>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          {formData.accessMode === 'open'
            ? 'Students can open their link at any time until the display deadline.'
            : 'Students can only access the assessment during the specified window.'}
        </p>
      </div>

      {/* Scheduled Window (shown only when scheduled mode is selected) */}
      {formData.accessMode === 'scheduled' && (
        <div className="bg-gray-100 rounded-lg p-4 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">Scheduled Access Window</h3>
          <div>
            <label htmlFor="scheduledWindowStart" className="block text-sm font-medium text-gray-600 mb-2">
              Window opens *
            </label>
            <input
              type="datetime-local"
              id="scheduledWindowStart"
              name="scheduledWindowStart"
              value={formData.scheduledWindowStart ?? ''}
              onChange={handleChange}
              className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:outline-none"
            />
            {errors.scheduledWindowStart && <p className="mt-1 text-sm text-red-400">{errors.scheduledWindowStart}</p>}
          </div>
          <div>
            <label htmlFor="scheduledWindowEnd" className="block text-sm font-medium text-gray-600 mb-2">
              Window closes *
            </label>
            <input
              type="datetime-local"
              id="scheduledWindowEnd"
              name="scheduledWindowEnd"
              value={formData.scheduledWindowEnd ?? ''}
              onChange={handleChange}
              className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:outline-none"
            />
            {errors.scheduledWindowEnd && <p className="mt-1 text-sm text-red-400">{errors.scheduledWindowEnd}</p>}
          </div>
        </div>
      )}

      {/* Total Questions */}
      <div>
        <label htmlFor="totalQuestions" className="block text-sm font-medium text-gray-700 mb-2">
          Number of Questions *
        </label>
        <input
          type="number"
          id="totalQuestions"
          name="totalQuestions"
          value={formData.totalQuestions}
          onChange={handleChange}
          min={1}
          max={20}
          className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:outline-none"
        />
        <p className="mt-1 text-sm text-gray-500">Recommended: 8 questions (1-20)</p>
        {errors.totalQuestions && (
          <p className="mt-1 text-sm text-red-400">{errors.totalQuestions}</p>
        )}
      </div>

      {/* Answer Mode */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Answer Mode *
        </label>
        <div className="flex space-x-4">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="radio"
              name="answerMode"
              checked={formData.answerMode === 'oral'}
              onChange={() => setFormData(prev => ({ ...prev, answerMode: 'oral', preparationTime: 60 }))}
              className="text-primary-600 focus:ring-primary-500"
            />
            <span className="text-gray-700 text-sm font-medium">Oral (voice recording)</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="radio"
              name="answerMode"
              checked={formData.answerMode === 'written'}
              onChange={() => setFormData(prev => ({ ...prev, answerMode: 'written', preparationTime: undefined }))}
              className="text-primary-600 focus:ring-primary-500"
            />
            <span className="text-gray-700 text-sm font-medium">Written (typed text)</span>
          </label>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          {formData.answerMode === 'oral'
            ? 'Students record an audio answer. A preparation countdown is shown before recording starts.'
            : 'Students type their answer. The answer timer starts immediately when the question is shown.'}
        </p>
      </div>

      {/* Preparation Time (oral only) */}
      {formData.answerMode === 'oral' && (
        <div>
          <label htmlFor="preparationTime" className="block text-sm font-medium text-gray-700 mb-2">
            Preparation Time (seconds)
          </label>
          <input
            type="number"
            id="preparationTime"
            name="preparationTime"
            value={formData.preparationTime ?? ''}
            onChange={handleChange}
            min={0}
            max={300}
            placeholder="60"
            className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:outline-none"
          />
          <p className="mt-1 text-sm text-gray-500">
            0-300 seconds (0-5 minutes). Time students have to read the question before recording begins. Set to 0 to start recording immediately.
          </p>
        </div>
      )}

      {/* Time Limit */}
      <div>
        <label htmlFor="timeLimit" className="block text-sm font-medium text-gray-700 mb-2">
          Time Limit per Question (minutes)
        </label>
        <input
          type="number"
          id="timeLimit"
          name="timeLimit"
          value={formData.timeLimit ?? ''}
          onChange={handleChange}
          min={1}
          max={30}
          placeholder="No limit"
          className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:outline-none"
        />
        <p className="mt-1 text-sm text-gray-500">Optional: 1-30 minutes per question. Leave blank for no time limit.</p>
        {errors.timeLimit && <p className="mt-1 text-sm text-red-400">{errors.timeLimit}</p>}
      </div>

      {/* Assessment Type (presets) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Assessment Type
        </label>
        <div className="flex flex-col gap-2">
          <label className="flex items-start space-x-2 cursor-pointer">
            <input
              type="radio"
              name="assessmentType"
              checked={assessmentType === 'proctored-exam'}
              onChange={() => applyPreset('proctored-exam')}
              className="mt-1 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm">
              <span className="font-medium text-gray-700">Proctored exam</span>
              <span className="block text-gray-500">Webcam proctoring on, answers locked once submitted, auto-scored on submit, results released manually.</span>
            </span>
          </label>
          <label className="flex items-start space-x-2 cursor-pointer">
            <input
              type="radio"
              name="assessmentType"
              checked={assessmentType === 'formative-practice'}
              onChange={() => applyPreset('formative-practice')}
              className="mt-1 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm">
              <span className="font-medium text-gray-700">Formative practice</span>
              <span className="block text-gray-500">No camera, students can revise their answers, auto-scored with feedback shown immediately.</span>
            </span>
          </label>
          <label className="flex items-start space-x-2 cursor-pointer">
            <input
              type="radio"
              name="assessmentType"
              checked={assessmentType === 'custom'}
              onChange={() => setAssessmentType('custom')}
              className="mt-1 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm">
              <span className="font-medium text-gray-700">Custom</span>
              <span className="block text-gray-500">Configure proctoring, review and feedback individually.</span>
            </span>
          </label>
        </div>
      </div>

      {/* Advanced settings — per-flag override */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced((s) => !s)}
          className="text-sm font-medium text-primary-700 hover:text-primary-800"
        >
          {showAdvanced || assessmentType === 'custom' ? '▾' : '▸'} Advanced settings
        </button>
        {(showAdvanced || assessmentType === 'custom') && (
          <div className="mt-3 bg-gray-100 rounded-lg p-4 space-y-4">
            {/* Proctoring */}
            <div>
              <span className="block text-sm font-medium text-gray-700 mb-1">Webcam proctoring</span>
              <div className="flex space-x-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="radio" name="proctored" checked={formData.proctored === true} onChange={() => setFlag({ proctored: true })} className="text-primary-600 focus:ring-primary-500" />
                  <span className="text-gray-700 text-sm">On</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="radio" name="proctored" checked={formData.proctored === false} onChange={() => setFlag({ proctored: false })} className="text-primary-600 focus:ring-primary-500" />
                  <span className="text-gray-700 text-sm">Off</span>
                </label>
              </div>
            </div>
            {/* Answer review */}
            <div>
              <span className="block text-sm font-medium text-gray-700 mb-1">Answer review</span>
              <div className="flex space-x-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="radio" name="allowReview" checked={formData.allowReview === false} onChange={() => setFlag({ allowReview: false })} className="text-primary-600 focus:ring-primary-500" />
                  <span className="text-gray-700 text-sm">Locked (one-shot, in order)</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="radio" name="allowReview" checked={formData.allowReview === true} onChange={() => setFlag({ allowReview: true })} className="text-primary-600 focus:ring-primary-500" />
                  <span className="text-gray-700 text-sm">Allow revisiting &amp; editing</span>
                </label>
              </div>
              <p className="mt-1 text-xs text-gray-500">Applies to written assessments.</p>
            </div>
            {/* Feedback release */}
            <div>
              <span className="block text-sm font-medium text-gray-700 mb-1">Feedback release</span>
              <div className="flex space-x-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="radio" name="feedbackRelease" checked={formData.feedbackRelease === 'manual'} onChange={() => setFlag({ feedbackRelease: 'manual' })} className="text-primary-600 focus:ring-primary-500" />
                  <span className="text-gray-700 text-sm">Manual (you release results)</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="radio" name="feedbackRelease" checked={formData.feedbackRelease === 'immediate'} onChange={() => setFlag({ feedbackRelease: 'immediate' })} className="text-primary-600 focus:ring-primary-500" />
                  <span className="text-gray-700 text-sm">Immediate (as soon as graded)</span>
                </label>
              </div>
            </div>
            {/* Automatic AI evaluation */}
            <div>
              <span className="block text-sm font-medium text-gray-700 mb-1">Automatic AI evaluation</span>
              <div className="flex space-x-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="radio" name="autoEvaluate" checked={formData.autoEvaluate === true} onChange={() => setFlag({ autoEvaluate: true })} className="text-primary-600 focus:ring-primary-500" />
                  <span className="text-gray-700 text-sm">On (score each student as they submit)</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="radio" name="autoEvaluate" checked={formData.autoEvaluate === false} onChange={() => setFlag({ autoEvaluate: false })} className="text-primary-600 focus:ring-primary-500" />
                  <span className="text-gray-700 text-sm">Off (evaluate manually later)</span>
                </label>
              </div>
              <p className="mt-1 text-xs text-gray-500">When on, a student's answers are AI-evaluated as soon as they submit — no need to wait for the whole class or click Evaluate.</p>
            </div>
            {formData.feedbackRelease === 'immediate' && !formData.autoEvaluate && (
              <p className="text-xs text-amber-600">
                Heads up: "immediate" feedback release has no effect unless automatic AI evaluation is on — with auto-evaluation off, there's nothing to show until you evaluate manually.
              </p>
            )}
            {formData.allowReview && formData.timeLimit != null && (
              <p className="text-xs text-amber-600">
                Heads up: per-question time limits and answer revisiting don't combine well — with review on, the timer is shown but won't auto-submit.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-4 pt-4">
        <button
          type="submit"
          className="bg-primary-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-primary-700 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Create Assessment
        </button>
        <button
          type="button"
          onClick={() => navigate('/assessments')}
          className="bg-gray-100 text-gray-700 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-white"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
