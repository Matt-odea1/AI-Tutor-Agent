/**
 * AudioRecorder - Audio recording component with playback controls
 */

import { useEffect, useState } from 'react';
import { formatDuration } from '../utils/helpers';
import { useAssessmentStore } from '../store/assessmentStore';

interface AudioRecorderProps {
  onSubmit?: () => void;
  timeLimit?: number; // in seconds
  disabled?: boolean;
}

export default function AudioRecorder({
  onSubmit,
  timeLimit = 300, // 5 minutes default
  disabled = false,
}: AudioRecorderProps) {
  const {
    isRecording,
    isPaused,
    recordingDuration,
    recordedBlob,
    isUploading,
    uploadProgress,
    error,
    initializeRecorder,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
    clearError,
  } = useAssessmentStore();

  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [autoStopped, setAutoStopped] = useState(false);

  // Initialize recorder on mount
  useEffect(() => {
    const init = async () => {
      try {
        setInitError(null);
        await initializeRecorder();
        setIsInitialized(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to access microphone';
        setInitError(msg.includes('Permission') || msg.includes('NotAllowed')
          ? 'Microphone access denied. Please allow microphone access in your browser settings and reload.'
          : `Microphone error: ${msg}`);
        console.error('Failed to initialize recorder:', err);
      }
    };

    if (!isInitialized && !disabled) {
      init();
    }
  }, [initializeRecorder, isInitialized, disabled]);

  // Stop recording when time limit reached
  useEffect(() => {
    if (isRecording && recordingDuration >= timeLimit) {
      stopRecording();
      setAutoStopped(true);
    }
  }, [isRecording, recordingDuration, timeLimit, stopRecording]);

  // Create audio URL when blob is available; revoke previous URL to prevent memory leak
  useEffect(() => {
    if (recordedBlob) {
      const url = URL.createObjectURL(recordedBlob);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      return () => URL.revokeObjectURL(url);
    }
  }, [recordedBlob]);

  const handleStartRecording = () => {
    if (error) clearError();
    setAutoStopped(false);
    startRecording();
  };

  const handleStopRecording = async () => {
    await stopRecording();
  };

  const handleRerecord = () => {
    cancelRecording();
    setAudioUrl(null);
  };

  const handleSubmit = () => {
    if (recordedBlob && onSubmit) {
      onSubmit();
    }
  };

  // Recording state
  const isIdle = !isRecording && !recordedBlob;
  const isRecordingState = isRecording && !isPaused;
  const isRecordedState = !isRecording && recordedBlob;
  const canSubmit = recordedBlob && !isUploading;

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Record Your Answer
      </h3>

      {/* Browser Support Warning / Error */}
      {!isInitialized && !disabled && (
        <div className={`mb-4 p-4 rounded-lg ${initError ? 'bg-red-50 border border-red-200' : 'bg-yellow-50 border border-yellow-200'}`}>
          <p className={`text-sm ${initError ? 'text-red-800' : 'text-yellow-800'}`}>
            {initError || 'Initializing microphone... Please allow microphone access when prompted.'}
          </p>
        </div>
      )}

      {/* Timer Display */}
      <div className="mb-6 text-center">
        <div className="inline-flex items-center justify-center">
          {/* Recording Indicator */}
          {isRecordingState && (
            <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse mr-3" />
          )}
          
          {/* Duration */}
          <div className="text-4xl font-mono font-bold text-gray-900">
            {formatDuration(recordingDuration)}
          </div>
          
        </div>
        
        {isRecordingState && (
          <p className="mt-2 text-sm text-gray-600">Recording in progress...</p>
        )}
        {isPaused && (
          <p className="mt-2 text-sm text-yellow-600">Recording paused</p>
        )}
      </div>

      {/* Recording Controls */}
      <div className="flex flex-col items-center space-y-3 mb-6">
        {/* Idle State: Start Recording */}
        {isIdle && (
          <button
            onClick={handleStartRecording}
            disabled={!isInitialized || disabled}
            className="flex items-center justify-center space-x-2 bg-red-600 text-white px-8 py-3 rounded-full hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
                clipRule="evenodd"
              />
            </svg>
            <span className="font-medium">Start Recording</span>
          </button>
        )}

        {/* Recording State: Pause/Resume and Stop */}
        {isRecording && (
          <div className="flex space-x-3">
            {/* Pause/Resume */}
            <button
              onClick={isPaused ? resumeRecording : pauseRecording}
              className="flex items-center space-x-2 bg-yellow-500 text-white px-6 py-3 rounded-full hover:bg-yellow-600 transition-colors"
            >
              {isPaused ? (
                <>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>Resume</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>Pause</span>
                </>
              )}
            </button>

            {/* Stop */}
            <button
              onClick={handleStopRecording}
              className="flex items-center space-x-2 bg-gray-700 text-white px-6 py-3 rounded-full hover:bg-gray-800 transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Stop</span>
            </button>
          </div>
        )}

        {/* Recorded State: Playback, Re-record, Submit */}
        {isRecordedState && (
          <div className="w-full space-y-3">
            {/* Audio Player */}
            {audioUrl && (
              <div className="flex items-center justify-center p-4 bg-gray-50 rounded-lg">
                <audio
                  controls
                  src={audioUrl}
                  className="w-full max-w-md"
                  preload="metadata"
                >
                  Your browser does not support audio playback.
                </audio>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-center space-x-3">
              <button
                onClick={handleRerecord}
                disabled={isUploading}
                className="flex items-center space-x-2 bg-gray-600 text-white px-6 py-3 rounded-full hover:bg-gray-700 disabled:bg-gray-400 transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Re-record</span>
              </button>

              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex items-center space-x-2 bg-green-600 text-white px-8 py-3 rounded-full hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {isUploading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Uploading... {uploadProgress}%</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>Submit Answer</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Auto-stop notification */}
      {autoStopped && isRecordedState && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            Recording stopped automatically — time limit reached ({formatDuration(timeLimit)}).
          </p>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <p className="text-sm text-red-800">{error.message}</p>
          {recordedBlob && !isUploading && (
            <button
              onClick={handleSubmit}
              className="ml-3 flex-shrink-0 bg-red-600 text-white px-4 py-1.5 rounded-md text-sm font-medium hover:bg-red-700 transition-colors"
            >
              Retry Upload
            </button>
          )}
        </div>
      )}

      {/* Instructions */}
      <div className="mt-4 p-3 bg-gray-50 rounded-lg">
        <p className="text-xs text-gray-600">
          <strong>Tips:</strong> Find a quiet place, speak clearly, and take your time.
          You can pause and resume recording if needed.
        </p>
      </div>
    </div>
  );
}
