import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { useAssessmentStore } from '../store/assessmentStore';
import type { CreateAssessmentRequest } from '../../../shared/types/assessment';

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
  });

  const [errors, setErrors] = useState<Partial<Record<keyof CreateAssessmentRequest | string, string>>>({});
  const initialFormData = useRef(formData);
  const hasSubmitted = useRef(false);

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
        <label htmlFor="title" className="block text-sm font-medium text-slate-200 mb-2">
          Assessment Title *
        </label>
        <input
          type="text"
          id="title"
          name="title"
          value={formData.title}
          onChange={handleChange}
          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:outline-none"
          placeholder="e.g., Midterm Oral Assessment"
        />
        {errors.title && <p className="mt-1 text-sm text-red-400">{errors.title}</p>}
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-slate-200 mb-2">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          value={formData.description}
          onChange={handleChange}
          rows={3}
          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none"
          placeholder="Describe the assessment objectives..."
        />
      </div>

      {/* Course */}
      <div>
        <label htmlFor="course" className="block text-sm font-medium text-slate-200 mb-2">
          Course *
        </label>
        <input
          type="text"
          id="course"
          name="course"
          value={formData.course}
          onChange={handleChange}
          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:outline-none"
          placeholder="e.g., CS 101 - Introduction to Programming"
        />
        {errors.course && <p className="mt-1 text-sm text-red-400">{errors.course}</p>}
      </div>

      {/* Due Date */}
      <div>
        <label htmlFor="dueDate" className="block text-sm font-medium text-slate-200 mb-2">
          Display Deadline *
        </label>
        <input
          type="datetime-local"
          id="dueDate"
          name="dueDate"
          value={formData.dueDate}
          onChange={handleChange}
          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:outline-none"
        />
        <p className="mt-1 text-sm text-slate-400">
          Shown to students as a reminder — does not enforce access. Use "Scheduled Window" below to restrict when students can open the assessment.
        </p>
        {errors.dueDate && <p className="mt-1 text-sm text-red-400">{errors.dueDate}</p>}
      </div>

      {/* Access Mode */}
      <div>
        <label className="block text-sm font-medium text-slate-200 mb-2">
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
            <span className="text-slate-200 text-sm font-medium">Open access</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="radio"
              name="accessMode"
              checked={formData.accessMode === 'scheduled'}
              onChange={() => handleAccessModeChange('scheduled')}
              className="text-primary-600 focus:ring-primary-500"
            />
            <span className="text-slate-200 text-sm font-medium">Scheduled window</span>
          </label>
        </div>
        <p className="mt-1 text-sm text-slate-400">
          {formData.accessMode === 'open'
            ? 'Students can open their link at any time until the display deadline.'
            : 'Students can only access the assessment during the specified window.'}
        </p>
      </div>

      {/* Scheduled Window (shown only when scheduled mode is selected) */}
      {formData.accessMode === 'scheduled' && (
        <div className="bg-slate-700/50 rounded-lg p-4 space-y-4">
          <h3 className="text-sm font-semibold text-slate-200">Scheduled Access Window</h3>
          <div>
            <label htmlFor="scheduledWindowStart" className="block text-sm font-medium text-slate-300 mb-2">
              Window opens *
            </label>
            <input
              type="datetime-local"
              id="scheduledWindowStart"
              name="scheduledWindowStart"
              value={formData.scheduledWindowStart ?? ''}
              onChange={handleChange}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:outline-none"
            />
            {errors.scheduledWindowStart && <p className="mt-1 text-sm text-red-400">{errors.scheduledWindowStart}</p>}
          </div>
          <div>
            <label htmlFor="scheduledWindowEnd" className="block text-sm font-medium text-slate-300 mb-2">
              Window closes *
            </label>
            <input
              type="datetime-local"
              id="scheduledWindowEnd"
              name="scheduledWindowEnd"
              value={formData.scheduledWindowEnd ?? ''}
              onChange={handleChange}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:outline-none"
            />
            {errors.scheduledWindowEnd && <p className="mt-1 text-sm text-red-400">{errors.scheduledWindowEnd}</p>}
          </div>
        </div>
      )}

      {/* Total Questions */}
      <div>
        <label htmlFor="totalQuestions" className="block text-sm font-medium text-slate-200 mb-2">
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
          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:outline-none"
        />
        <p className="mt-1 text-sm text-slate-400">Recommended: 8 questions (1-20)</p>
        {errors.totalQuestions && (
          <p className="mt-1 text-sm text-red-400">{errors.totalQuestions}</p>
        )}
      </div>

      {/* Answer Mode */}
      <div>
        <label className="block text-sm font-medium text-slate-200 mb-2">
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
            <span className="text-slate-200 text-sm font-medium">Oral (voice recording)</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="radio"
              name="answerMode"
              checked={formData.answerMode === 'written'}
              onChange={() => setFormData(prev => ({ ...prev, answerMode: 'written', preparationTime: undefined }))}
              className="text-primary-600 focus:ring-primary-500"
            />
            <span className="text-slate-200 text-sm font-medium">Written (typed text)</span>
          </label>
        </div>
        <p className="mt-1 text-sm text-slate-400">
          {formData.answerMode === 'oral'
            ? 'Students record an audio answer. A preparation countdown is shown before recording starts.'
            : 'Students type their answer. The answer timer starts immediately when the question is shown.'}
        </p>
      </div>

      {/* Preparation Time (oral only) */}
      {formData.answerMode === 'oral' && (
        <div>
          <label htmlFor="preparationTime" className="block text-sm font-medium text-slate-200 mb-2">
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
            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:outline-none"
          />
          <p className="mt-1 text-sm text-slate-400">
            0-300 seconds (0-5 minutes). Time students have to read the question before recording begins. Set to 0 to start recording immediately.
          </p>
        </div>
      )}

      {/* Time Limit */}
      <div>
        <label htmlFor="timeLimit" className="block text-sm font-medium text-slate-200 mb-2">
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
          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:outline-none"
        />
        <p className="mt-1 text-sm text-slate-400">Optional: 1-30 minutes per question. Leave blank for no time limit.</p>
        {errors.timeLimit && <p className="mt-1 text-sm text-red-400">{errors.timeLimit}</p>}
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-4 pt-4">
        <button
          type="submit"
          className="bg-primary-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-primary-700 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Create Assessment
        </button>
        <button
          type="button"
          onClick={() => navigate('/assessments')}
          className="bg-slate-700 text-slate-200 px-6 py-2.5 rounded-lg font-medium hover:bg-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-900"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
