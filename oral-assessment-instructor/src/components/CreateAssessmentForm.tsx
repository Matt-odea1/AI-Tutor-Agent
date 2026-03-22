import { useState } from 'react';
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
  });

  const [errors, setErrors] = useState<Partial<Record<keyof CreateAssessmentRequest, string>>>({});

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
      if (dueDate < new Date()) {
        newErrors.dueDate = 'Due date must be in the future';
      }
    }

    if (formData.totalQuestions < 1 || formData.totalQuestions > 20) {
      newErrors.totalQuestions = 'Total questions must be between 1 and 20';
    }

    if (formData.timeLimit && (formData.timeLimit < 1 || formData.timeLimit > 30)) {
      newErrors.timeLimit = 'Time limit must be between 1 and 30 minutes';
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
        : name === 'timeLimit'
        ? (value === '' ? undefined : Number(value))
        : value,
    }));

    // Clear error for this field
    if (errors[name as keyof CreateAssessmentRequest]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
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
          Due Date *
        </label>
        <input
          type="datetime-local"
          id="dueDate"
          name="dueDate"
          value={formData.dueDate}
          onChange={handleChange}
          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:outline-none"
        />
        {errors.dueDate && <p className="mt-1 text-sm text-red-400">{errors.dueDate}</p>}
      </div>

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
        <p className="mt-1 text-sm text-slate-400">Optional: Leave blank for no time limit</p>
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
          onClick={() => navigate('/')}
          className="bg-slate-700 text-slate-200 px-6 py-2.5 rounded-lg font-medium hover:bg-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-900"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
