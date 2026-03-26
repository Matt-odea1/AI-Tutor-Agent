/**
 * VideoRecorder component — webcam preview + record/stop/playback controls
 * Mirrors AudioRecorder.tsx but surfaces a <video> preview element.
 */
import { useEffect, useRef, useState } from 'react';
import { useAssessmentStore } from '../store/assessmentStore';

interface VideoRecorderProps {
  onSubmit?: () => void;
  timeLimit?: number; // seconds; 0 = no limit
}

export default function VideoRecorder({ onSubmit, timeLimit = 0 }: VideoRecorderProps) {
  const {
    isRecording,
    isPaused,
    recordingDuration,
    videoBlob,
    videoPreviewUrl,
    isUploading,
    error,
    initializeVideoRecorder,
    startVideoRecording,
    stopVideoRecording,
    pauseVideoRecording,
    resumeVideoRecording,
    cancelVideoRecording,
  } = useAssessmentStore();

  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const [initialized, setInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Initialize on mount
  useEffect(() => {
    let cancelled = false;
    initializeVideoRecorder()
      .then((stream) => {
        if (!cancelled && liveVideoRef.current && stream) {
          liveVideoRef.current.srcObject = stream;
        }
        if (!cancelled) setInitialized(true);
      })
      .catch((err: Error) => {
        if (!cancelled) setInitError(err.message);
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const timeLimitReached = timeLimit > 0 && recordingDuration >= timeLimit;

  if (initError) {
    return (
      <div className="bg-white rounded-lg border border-red-200 p-6">
        <p className="text-red-600 text-sm">{initError}</p>
        <button
          onClick={() => { setInitError(null); initializeVideoRecorder(); }}
          className="mt-3 text-sm text-primary-600 underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!initialized) {
    return (
      <div className="bg-white rounded-lg border p-6 flex items-center justify-center h-48">
        <p className="text-gray-500 text-sm">Requesting camera access…</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
      {/* Live preview / playback */}
      {!videoBlob ? (
        <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
          <video
            ref={liveVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
          />
          {isRecording && (
            <div className="absolute top-3 right-3 flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white text-xs font-semibold bg-black/50 px-1.5 py-0.5 rounded">
                {isPaused ? 'PAUSED' : 'REC'}
              </span>
            </div>
          )}
          {isRecording && (
            <div className={`absolute bottom-3 right-3 text-sm font-mono font-semibold px-2 py-1 rounded ${
              timeLimitReached
                ? 'bg-red-600 text-white'
                : recordingDuration > 0 && timeLimit > 0 && (timeLimit - recordingDuration) <= 30
                ? 'bg-orange-500 text-white'
                : 'bg-black/50 text-white'
            }`}>
              {formatTime(recordingDuration)}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-black rounded-lg overflow-hidden aspect-video">
          <video
            src={videoPreviewUrl ?? undefined}
            controls
            playsInline
            className="w-full h-full"
          />
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-2 justify-center">
        {!isRecording && !videoBlob && (
          <button
            onClick={startVideoRecording}
            className="flex items-center space-x-2 bg-red-600 text-white px-5 py-2.5 rounded-lg hover:bg-red-700 transition-colors font-medium"
          >
            <span className="w-3 h-3 rounded-full bg-white" />
            <span>Start Recording</span>
          </button>
        )}

        {isRecording && !isPaused && (
          <>
            <button
              onClick={pauseVideoRecording}
              className="flex items-center space-x-2 bg-yellow-500 text-white px-5 py-2.5 rounded-lg hover:bg-yellow-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>Pause</span>
            </button>
            <button
              onClick={stopVideoRecording}
              className="flex items-center space-x-2 bg-gray-800 text-white px-5 py-2.5 rounded-lg hover:bg-gray-900 transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
              </svg>
              <span>Stop</span>
            </button>
          </>
        )}

        {isRecording && isPaused && (
          <>
            <button
              onClick={resumeVideoRecording}
              className="flex items-center space-x-2 bg-green-600 text-white px-5 py-2.5 rounded-lg hover:bg-green-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
              <span>Resume</span>
            </button>
            <button
              onClick={stopVideoRecording}
              className="flex items-center space-x-2 bg-gray-800 text-white px-5 py-2.5 rounded-lg hover:bg-gray-900 transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
              </svg>
              <span>Stop</span>
            </button>
          </>
        )}

        {videoBlob && (
          <>
            <button
              onClick={cancelVideoRecording}
              className="flex items-center space-x-2 bg-gray-200 text-gray-700 px-5 py-2.5 rounded-lg hover:bg-gray-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4l16 16M4 20L20 4" />
              </svg>
              <span>Re-record</span>
            </button>
            <button
              onClick={onSubmit}
              disabled={isUploading}
              className="flex items-center space-x-2 bg-primary-600 text-white px-6 py-2.5 rounded-lg hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {isUploading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Uploading…</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Submit Video Answer</span>
                </>
              )}
            </button>
          </>
        )}
      </div>

      {error && (
        <p className="text-red-600 text-sm text-center">{error.message}</p>
      )}
    </div>
  );
}
