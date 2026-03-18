/**
 * ProctorCamera — fixed bottom-right Picture-in-Picture webcam preview
 * with a red REC indicator. Mounts once proctoring consent has been given.
 */
import { useEffect, useRef } from 'react';

interface ProctorCameraProps {
  stream: MediaStream | null;
  isRecording: boolean;
}

export default function ProctorCamera({ stream, isRecording }: ProctorCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (!stream) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-40 shadow-xl rounded-lg overflow-hidden border-2 border-gray-800"
      style={{ width: 160, height: 120 }}
      title="Proctoring camera — your session is being recorded"
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="w-full h-full object-cover bg-black"
      />
      {isRecording && (
        <div className="absolute top-1.5 left-1.5 flex items-center space-x-1">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-white text-[10px] font-bold leading-none bg-black/60 px-1 py-0.5 rounded">
            REC
          </span>
        </div>
      )}
    </div>
  );
}
