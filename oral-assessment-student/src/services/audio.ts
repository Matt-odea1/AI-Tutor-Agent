/**
 * Audio Recording Service - Handles browser MediaRecorder API
 */

export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  blob: Blob | null;
}

/**
 * Inputs to the pre-flight "is the mic confirmed working" gate. Kept as a pure,
 * framework-agnostic predicate so the DeviceCheck Start-button gating can be
 * unit-tested without a real mic. Confirmed === permission granted AND we have
 * positive evidence the mic actually captures sound — either a live-meter signal
 * crossed the threshold at least once, or the student recorded and played back a
 * sample.
 */
export interface MicConfirmation {
  permissionState: 'prompting' | 'granted' | 'denied' | 'error';
  hasDetectedSound: boolean;
  hasSample: boolean;
}

export function isMicConfirmed({
  permissionState,
  hasDetectedSound,
  hasSample,
}: MicConfirmation): boolean {
  if (permissionState !== 'granted') return false;
  return hasDetectedSound || hasSample;
}

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private startTime: number = 0;
  private pausedTime: number = 0;
  // When false, cleanup() must NOT stop the stream's tracks — the stream wraps a
  // track owned by the proctoring session, which manages its own lifecycle.
  // Defaults to true (the no-arg getUserMedia path owns and stops its own track).
  private ownsStream = true;

  /**
   * Initialize the recorder.
   *
   * Overloaded argument:
   *   - A LIVE `MediaStreamTrack` (the proctoring camera's audio track): the
   *     recorder wraps it in a fresh MediaStream and does NOT call getUserMedia —
   *     avoiding a second concurrent capture session (the Safari/iOS
   *     NotReadableError). In this case the recorder does NOT own the track and
   *     cleanup() leaves it running so proctoring keeps recording.
   *   - A `deviceId` string (the pre-flight DeviceCheck): requests its OWN
   *     getUserMedia stream constrained to `deviceId: { exact: deviceId }` so the
   *     student can test a chosen input. The recorder owns this stream.
   *   - Omitted (or a passed track that is not live): falls back to its own
   *     getUserMedia({audio}) capture against the default device, which it owns
   *     and stops on cleanup().
   *
   * The existing `echoCancellation` / `noiseSuppression` / `sampleRate` defaults
   * and the error-name → friendly-message mapping are preserved on every path.
   */
  async initialize(arg?: MediaStreamTrack | string): Promise<void> {
    const deviceId = typeof arg === 'string' ? arg : undefined;
    const existingAudioTrack = typeof arg === 'string' ? undefined : arg;
    try {
      if (existingAudioTrack && existingAudioTrack.readyState === 'live') {
        // Reuse the already-granted proctoring audio track. Build the recorder
        // from a new MediaStream wrapping it — no getUserMedia, no ownership.
        this.ownsStream = false;
        this.stream = new MediaStream([existingAudioTrack]);
      } else {
        // No usable track passed — request our own audio stream (we own it).
        // When a deviceId is provided, pin capture to that exact input.
        this.ownsStream = true;
        const audioConstraints: MediaTrackConstraints = {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        };
        if (deviceId) {
          audioConstraints.deviceId = { exact: deviceId };
        }
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
        });
      }

      // Check for supported MIME types
      const mimeType = this.getSupportedMimeType();

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
        audioBitsPerSecond: 128000, // 128kbps
      });

      // Collect audio chunks
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          throw new Error('Microphone permission denied. Please allow microphone access to record your answer.');
        } else if (error.name === 'NotFoundError') {
          throw new Error('No microphone found. Please connect a microphone and try again.');
        } else if (error.name === 'NotReadableError' || error.name === 'AbortError') {
          // The mic is already held by another capture session (the proctoring
          // camera on devices that can't share the mic, e.g. Safari/iOS). Give the
          // student an actionable message instead of the raw error.
          throw new Error('Your microphone is already in use by the proctoring camera. Please reload the page and grant access again.');
        } else {
          throw new Error(`Failed to initialize audio recorder: ${error.message}`);
        }
      }
      throw error;
    }
  }

  /**
   * Get supported MIME type for recording
   */
  private getSupportedMimeType(): string {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return ''; // Use default
  }

  /**
   * Start recording
   */
  start(): void {
    if (!this.mediaRecorder) {
      throw new Error('Audio recorder not initialized');
    }

    if (this.mediaRecorder.state === 'recording') {
      return; // Already recording
    }

    this.audioChunks = [];
    this.startTime = Date.now();
    this.mediaRecorder.start(100); // Collect data every 100ms
  }

  /**
   * Stop recording and return audio blob
   */
  async stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('Audio recorder not initialized'));
        return;
      }

      if (this.mediaRecorder.state === 'inactive') {
        reject(new Error('Recorder is not active'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.audioChunks, { 
          type: this.mediaRecorder?.mimeType || 'audio/webm' 
        });
        
        if (blob.size === 0) {
          reject(new Error('Recording failed - no audio data captured'));
          return;
        }

        resolve(blob);
      };

      this.mediaRecorder.stop();
    });
  }

  /**
   * Pause recording
   */
  pause(): void {
    if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') {
      return;
    }

    this.mediaRecorder.pause();
    this.pausedTime = Date.now();
  }

  /**
   * Resume recording
   */
  resume(): void {
    if (!this.mediaRecorder || this.mediaRecorder.state !== 'paused') {
      return;
    }

    this.mediaRecorder.resume();
    this.startTime += Date.now() - this.pausedTime;
  }

  /**
   * Get current recording duration in seconds
   */
  getDuration(): number {
    if (!this.startTime) return 0;
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Get current recording state
   */
  getState(): 'inactive' | 'recording' | 'paused' {
    return this.mediaRecorder?.state || 'inactive';
  }

  /**
   * Expose the current live MediaStream (or null when not initialized / cleaned
   * up). The pre-flight DeviceCheck attaches its OWN AudioContext + AnalyserNode
   * to this stream to drive a live input-level meter — keeping all React/rAF and
   * AudioContext lifecycle out of this framework-agnostic class.
   */
  getStream(): MediaStream | null {
    return this.stream;
  }

  /**
   * Create an audio URL for playback
   */
  createAudioUrl(blob: Blob): string {
    return URL.createObjectURL(blob);
  }

  /**
   * Release audio URL
   */
  releaseAudioUrl(url: string): void {
    URL.revokeObjectURL(url);
  }

  /**
   * Clean up and release resources
   */
  cleanup(): void {
    if (this.stream) {
      // Only stop tracks we own. A reused proctoring audio track (ownsStream
      // false) must keep running so proctoring isn't killed when a per-question
      // recorder is torn down; proctoring's own stopProctoring() stops it.
      if (this.ownsStream) {
        this.stream.getTracks().forEach(track => track.stop());
      }
      this.stream = null;
    }

    this.mediaRecorder = null;
    this.audioChunks = [];
    this.startTime = 0;
    this.pausedTime = 0;
  }

  /**
   * List available audio input devices via enumerateDevices(). Returns only
   * `audioinput` entries. NOTE: device `label`s are blank until microphone
   * permission has been granted, so callers should enumerate AFTER a successful
   * getUserMedia (i.e. after initialize() resolves).
   */
  static async listInputDevices(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== 'function') {
      return [];
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'audioinput');
  }

  /**
   * Check if browser supports audio recording
   */
  static isSupported(): boolean {
    return !!(
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      window.MediaRecorder
    );
  }

  /**
   * Get audio format extension
   */
  getFileExtension(): string {
    const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
    
    if (mimeType.includes('webm')) return 'webm';
    if (mimeType.includes('ogg')) return 'ogg';
    if (mimeType.includes('mp4')) return 'mp4';
    
    return 'webm';
  }
}

export default AudioRecorder;
