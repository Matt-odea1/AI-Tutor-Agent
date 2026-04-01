import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiService } from '../services/api';
import { useAssessmentStore } from '../store/assessmentStore';
import type { Student } from '../../../shared/types/assessment';

interface QuestionGenerationProgressProps {
  assessmentId: string;
}

export default function QuestionGenerationProgress({ assessmentId }: QuestionGenerationProgressProps) {
  const navigate = useNavigate();
  const { generationJob, setGenerationJob, setLoading, setError } = useAssessmentStore();
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [jobStartTime, setJobStartTime] = useState<number | null>(null);
  const [elapsedDisplay, setElapsedDisplay] = useState('');
  const pollDelayRef = useRef(3000);
  const JOB_KEY = `genJob:${assessmentId}`;

  // Restore job from localStorage on mount (survives page refresh)
  useEffect(() => {
    if (!generationJob) {
      try {
        const stored = localStorage.getItem(JOB_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.status === 'pending' || parsed.status === 'running') {
            setGenerationJob(parsed);
          }
        }
      } catch { /* ignore parse errors */ }
    }
  }, []);

  // Persist job to localStorage whenever it changes
  useEffect(() => {
    if (generationJob) {
      localStorage.setItem(JOB_KEY, JSON.stringify(generationJob));
    }
  }, [generationJob]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearTimeout(pollingInterval);
      }
    };
  }, [pollingInterval]);

  // Track elapsed time while job is running
  useEffect(() => {
    if (generationJob && (generationJob.status === 'pending' || generationJob.status === 'running')) {
      if (!jobStartTime) setJobStartTime(Date.now());
      const timer = setInterval(() => {
        if (jobStartTime) {
          const seconds = Math.floor((Date.now() - jobStartTime) / 1000);
          const mins = Math.floor(seconds / 60);
          const secs = seconds % 60;
          setElapsedDisplay(mins > 0 ? `${mins}m ${secs}s` : `${secs}s`);
        }
      }, 1000);
      return () => clearInterval(timer);
    } else {
      if (generationJob?.status === 'completed' || generationJob?.status === 'failed') {
        // Keep final elapsed display, reset start time
        setJobStartTime(null);
      }
    }
  }, [generationJob?.status, jobStartTime]);

  // Start polling when job is in progress
  useEffect(() => {
    if (generationJob && (generationJob.status === 'pending' || generationJob.status === 'running')) {
      startPolling();
    } else if (pollingInterval) {
      clearTimeout(pollingInterval);
      setPollingInterval(null);
      pollDelayRef.current = 3000; // reset backoff
    }
  }, [generationJob?.status]);

  const scheduleNextPoll = useCallback(() => {
    if (!generationJob?.jobId) return;

    const timeout = setTimeout(async () => {
      try {
        const updatedJob = await apiService.getQuestionGenerationStatus(assessmentId, generationJob.jobId);
        setGenerationJob(updatedJob);

        // Stop polling if job is complete or failed
        if (updatedJob.status === 'completed' || updatedJob.status === 'failed') {
          setPollingInterval(null);
          pollDelayRef.current = 3000;
          return;
        }
      } catch (err) {
        console.error('Error polling job status:', err);
      }

      // Exponential backoff: 3s -> 5s -> 10s -> 20s -> 30s (max)
      pollDelayRef.current = Math.min(pollDelayRef.current * 1.5, 30000);
      scheduleNextPoll();
    }, pollDelayRef.current);

    setPollingInterval(timeout);
  }, [assessmentId, generationJob?.jobId]);

  const startPolling = useCallback(() => {
    if (pollingInterval) return; // Already polling
    pollDelayRef.current = 3000; // reset on fresh start
    scheduleNextPoll();
  }, [pollingInterval, scheduleNextPoll]);

  // Load students when job completes so we can show per-student question links
  useEffect(() => {
    if (generationJob?.status === 'completed' && students.length === 0) {
      apiService.getAssessmentStudents(assessmentId)
        .then(s => setStudents(Array.isArray(s) ? s : []))
        .catch(() => { /* non-critical */ });
    }
  }, [generationJob?.status]);

  const handleStartGeneration = async () => {
    // Prevent duplicate generation if a job is already in progress
    if (generationJob && (generationJob.status === 'pending' || generationJob.status === 'running')) {
      return;
    }
    try {
      setIsGenerating(true);
      setLoading(true);
      setError(null);

      const job = await apiService.generateQuestions({ assessmentId });
      setGenerationJob(job);

      // Start polling for status updates
      startPolling();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start question generation');
    } finally {
      setIsGenerating(false);
      setLoading(false);
    }
  };

  const handleCancel = () => {
    // No server-side cancel endpoint exists; reset client-side state
    if (pollingInterval) {
      clearTimeout(pollingInterval);
      setPollingInterval(null);
    }
    pollDelayRef.current = 3000;
    setJobStartTime(null);
    setElapsedDisplay('');
    localStorage.removeItem(JOB_KEY);
    setGenerationJob(null);
    setIsGenerating(false);
  };

  const handleContinue = () => {
    navigate(`/assessments/${assessmentId}/monitor`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-400';
      case 'running':
        return 'text-blue-400';
      case 'pending':
        return 'text-yellow-400';
      case 'failed':
        return 'text-red-400';
      default:
        return 'text-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <svg className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'running':
        return (
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400"></div>
        );
      case 'pending':
        return (
          <svg className="h-6 w-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'failed':
        return (
          <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return null;
    }
  };

  const progressPercentage = generationJob
    ? generationJob.totalStudents > 0
      ? Math.round((generationJob.processedCount / generationJob.totalStudents) * 100)
      : 0
    : 0;

  return (
    <div className="max-w-2xl space-y-6">

      {/* Generation Status */}
      {!generationJob ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-gray-500 mb-6">
            Generate personalised questions for each student based on their submitted code.
          </p>
          <button
            onClick={handleStartGeneration}
            disabled={isGenerating}
            className="bg-primary-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-primary-700 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? 'Starting...' : 'Generate Questions'}
          </button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              {getStatusIcon(generationJob.status)}
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Question Generation
                </h3>
                <p className={`text-sm ${getStatusColor(generationJob.status)}`}>
                  Status: {generationJob.status.charAt(0).toUpperCase() + generationJob.status.slice(1)}
                </p>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex justify-between text-sm text-gray-500 mb-2">
              <span>Progress</span>
              <span>
                {generationJob.processedCount} / {generationJob.totalStudents} students
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${
                  generationJob.status === 'completed'
                    ? 'bg-green-500'
                    : generationJob.status === 'failed'
                    ? 'bg-red-500'
                    : 'bg-primary-600'
                }`}
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            <div className="flex justify-center items-center gap-4 mt-2">
              <span className="text-2xl font-bold text-gray-700">
                {generationJob.totalStudents === 0 ? 'No students' : `${progressPercentage}%`}
              </span>
              {elapsedDisplay && (
                <span className="text-sm text-gray-500">Elapsed: {elapsedDisplay}</span>
              )}
            </div>
          </div>

          {/* Stats Grid */}
          <div className={`grid ${generationJob.failedCount > 0 ? 'grid-cols-3' : 'grid-cols-2'} gap-4 mb-6`}>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-500 mb-1">Total Students</div>
              <div className="text-2xl font-bold text-gray-900">
                {generationJob.totalStudents}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-500 mb-1">Processed</div>
              <div className="text-2xl font-bold text-gray-900">
                {generationJob.processedCount}
              </div>
            </div>
            {generationJob.failedCount > 0 && (
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-red-400 mb-1">Failed</div>
                <div className="text-2xl font-bold text-red-400">
                  {generationJob.failedCount}
                </div>
              </div>
            )}
          </div>

          {/* Partial failure warning */}
          {generationJob.status === 'completed' && generationJob.failedCount > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500 rounded-lg p-4 mb-6">
              <div className="flex items-start">
                <svg className="h-5 w-5 text-yellow-400 mr-3 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <div>
                  <h4 className="text-sm font-medium text-yellow-300 mb-1">Partial Failure</h4>
                  <p className="text-sm text-yellow-200">
                    {generationJob.failedCount} student(s) failed question generation. You can retry generation for those students.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Error Display */}
          {generationJob.status === 'failed' && generationJob.error && (
            <div className="bg-red-500/10 border border-red-500 rounded-lg p-4 mb-6">
              <div className="flex items-start">
                <svg
                  className="h-5 w-5 text-red-400 mr-3 mt-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div>
                  <h4 className="text-sm font-medium text-red-300 mb-1">Generation Failed</h4>
                  <p className="text-sm text-red-200">{generationJob.error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Status Message */}
          <div className="text-center">
            {generationJob.status === 'pending' && (
              <div className="space-y-3">
                <p className="text-gray-500 text-sm">
                  Waiting to start... Your job is in the queue.
                </p>
                <button
                  onClick={handleCancel}
                  className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            )}
            {generationJob.status === 'running' && (
              <div className="space-y-3">
                <p className="text-gray-500 text-sm">
                  Generating questions... This may take a few minutes.
                </p>
                <button
                  onClick={handleCancel}
                  className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            )}
            {generationJob.status === 'completed' && (
              <div className="space-y-4">
                <p className="text-green-400 text-sm font-medium">
                  ✓ Question generation completed successfully!
                </p>
                {students.length > 0 && (
                  <div className="text-left mt-4">
                    <h4 className="text-sm font-medium text-gray-600 mb-2">
                      Questions generated for {students.length} student{students.length !== 1 ? 's' : ''}
                    </h4>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {students.map(s => (
                        <Link
                          key={s.studentId}
                          to={`/assessments/${assessmentId}/questions/${s.studentId}`}
                          className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors text-sm"
                        >
                          <span className="text-gray-700">{s.name || s.studentId}</span>
                          <span className="text-primary-400 text-xs font-medium">Edit Questions →</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                <button
                  onClick={handleContinue}
                  className="bg-primary-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-primary-700 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-white"
                >
                  Continue to Monitor Progress
                </button>
              </div>
            )}
            {generationJob.status === 'failed' && (
              <button
                onClick={handleStartGeneration}
                disabled={isGenerating}
                className="bg-red-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-white disabled:opacity-50"
              >
                Retry Generation
              </button>
            )}
          </div>
        </div>
      )}

      {/* Additional Info */}
      <div className="bg-blue-500/10 border border-blue-500 rounded-lg p-4">
        <div className="flex items-start">
          <svg
            className="h-5 w-5 text-blue-400 mr-3 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <h4 className="text-sm font-medium text-blue-300 mb-1">Note</h4>
            <p className="text-sm text-blue-200">
              You can safely navigate away from this page. The generation process will continue 
              in the background, and you can check the status anytime.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
