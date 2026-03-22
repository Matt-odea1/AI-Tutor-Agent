import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { useAssessmentStore } from '../store/assessmentStore';

interface QuestionGenerationProgressProps {
  assessmentId: string;
}

export default function QuestionGenerationProgress({ assessmentId }: QuestionGenerationProgressProps) {
  const navigate = useNavigate();
  const { generationJob, setGenerationJob, setLoading, setError } = useAssessmentStore();
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  // Start polling when job is in progress
  useEffect(() => {
    if (generationJob && (generationJob.status === 'pending' || generationJob.status === 'running')) {
      startPolling();
    } else if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
  }, [generationJob?.status]);

  const startPolling = useCallback(() => {
    if (pollingInterval) return; // Already polling

    const interval = setInterval(async () => {
      if (!generationJob?.jobId) return;

      try {
        const updatedJob = await apiService.getGenerationJobStatus(generationJob.jobId);
        setGenerationJob(updatedJob);

        // Stop polling if job is complete or failed
        if (updatedJob.status === 'completed' || updatedJob.status === 'failed') {
          clearInterval(interval);
          setPollingInterval(null);
        }
      } catch (err) {
        console.error('Error polling job status:', err);
        // Continue polling despite errors
      }
    }, 3000); // Poll every 3 seconds

    setPollingInterval(interval);
  }, [generationJob?.jobId, pollingInterval]);

  const handleStartGeneration = async () => {
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
        return 'text-slate-400';
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
    ? Math.round((generationJob.processedCount / generationJob.totalStudents) * 100)
    : 0;

  return (
    <div className="max-w-2xl space-y-6">
      {/* Info Panel */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-slate-100 mb-3">
          Step 3: Generate Questions
        </h3>
        <p className="text-slate-300 mb-4">
          Use AI to automatically generate personalized oral assessment questions for each student 
          based on their submitted code. This process analyzes the code structure, logic, and 
          patterns to create relevant questions.
        </p>
        <div className="bg-slate-900 border border-slate-700 rounded p-4">
          <h4 className="text-sm font-medium text-slate-200 mb-2">How it works:</h4>
          <ul className="space-y-1.5 text-sm text-slate-400">
            <li className="flex items-start">
              <span className="text-primary-400 mr-2">1.</span>
              <span>Code is analyzed using Neo4j vector similarity and graph relationships</span>
            </li>
            <li className="flex items-start">
              <span className="text-primary-400 mr-2">2.</span>
              <span>The AI generates unique questions tailored to each student's code and the assignment brief</span>
            </li>
            <li className="flex items-start">
              <span className="text-primary-400 mr-2">3.</span>
              <span>Questions are validated and stored in the database</span>
            </li>
            <li className="flex items-start">
              <span className="text-primary-400 mr-2">4.</span>
              <span>Students receive email notifications to begin their assessment</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Generation Status */}
      {!generationJob ? (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
          <svg
            className="mx-auto h-16 w-16 text-slate-400 mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
          <h3 className="text-lg font-semibold text-slate-100 mb-2">
            Ready to Generate Questions
          </h3>
          <p className="text-slate-400 mb-6">
            Click the button below to start the AI-powered question generation process.
            This may take several minutes depending on the number of students.
          </p>
          <button
            onClick={handleStartGeneration}
            disabled={isGenerating}
            className="bg-primary-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-primary-700 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? 'Starting...' : 'Generate Questions'}
          </button>
        </div>
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              {getStatusIcon(generationJob.status)}
              <div>
                <h3 className="text-lg font-semibold text-slate-100">
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
            <div className="flex justify-between text-sm text-slate-400 mb-2">
              <span>Progress</span>
              <span>
                {generationJob.processedCount} / {generationJob.totalStudents} students
              </span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-3">
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
            <div className="flex justify-center mt-2">
              <span className="text-2xl font-bold text-slate-200">{progressPercentage}%</span>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-slate-900 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Total Students</div>
              <div className="text-2xl font-bold text-slate-100">
                {generationJob.totalStudents}
              </div>
            </div>
            <div className="bg-slate-900 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Processed</div>
              <div className="text-2xl font-bold text-slate-100">
                {generationJob.processedCount}
              </div>
            </div>
          </div>

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
              <p className="text-slate-400 text-sm">
                Waiting to start... Your job is in the queue.
              </p>
            )}
            {generationJob.status === 'running' && (
              <p className="text-slate-400 text-sm">
                Generating questions... This may take a few minutes.
              </p>
            )}
            {generationJob.status === 'completed' && (
              <div className="space-y-4">
                <p className="text-green-400 text-sm font-medium">
                  ✓ Question generation completed successfully!
                </p>
                <button
                  onClick={handleContinue}
                  className="bg-primary-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-primary-700 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-slate-900"
                >
                  Continue to Monitor Progress
                </button>
              </div>
            )}
            {generationJob.status === 'failed' && (
              <button
                onClick={handleStartGeneration}
                disabled={isGenerating}
                className="bg-red-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50"
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
