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
 * Resolve the AudioContext constructor across browsers (Safari prefixes it as
 * `webkitAudioContext`). Returns null when neither exists, so callers can fall
 * back to a static amplitude on unsupported browsers. Mirrors the detection in
 * `helpers.ts:checkBrowserSupport` and `DeviceCheck.tsx`.
 */
export function resolveAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  return (
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
    null
  );
}

/**
 * Pure RMS (root-mean-square) of one frame of `getByteTimeDomainData` samples,
 * normalised to 0..1. Each byte is centred on 128 (silence); the deviation from
 * the midpoint, scaled to ±1, is squared and averaged, then square-rooted.
 * Extracted so the amplitude math can be unit-tested without a real AudioContext.
 */
export function rmsFromTimeDomain(data: Uint8Array): number {
  if (data.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128;
    sumSquares += v * v;
  }
  const rms = Math.sqrt(sumSquares / data.length);
  // Clamp to 0..1 against any out-of-range sample.
  return rms > 1 ? 1 : rms;
}

/** Amplitude returned when no AudioContext/AnalyserNode is available. */
export const STATIC_AMPLITUDE = 0;

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
  // Live mic-amplitude metering for the recorder's breathing ring. Owned by this
  // recorder (separate from the DeviceCheck pre-flight meter, which builds its
  // own AudioContext on getStream()). Disposed in cleanup(). Null when the
  // browser lacks AudioContext or the analyser failed to attach.
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  // Backed by a concrete ArrayBuffer (not ArrayBufferLike) so it satisfies the
  // AnalyserNode.getByteTimeDomainData signature in current TS DOM libs.
  private timeDomainData: Uint8Array<ArrayBuffer> | null = null;

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

      // Attach a live amplitude analyser for the recorder's breathing ring.
      // Best-effort: a failure here must never block recording, so it is
      // swallowed and getAmplitude() simply returns a static value.
      this.attachAmplitudeAnalyser();
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
   * Build an AudioContext + AnalyserNode over the current stream so the UI can
   * read a live 0..1 amplitude via getAmplitude(). Best-effort and idempotent:
   * does nothing (leaving getAmplitude() on its static fallback) when there is
   * no stream or the browser has no AudioContext. Any construction error is
   * swallowed — metering is decorative and must never break recording.
   */
  private attachAmplitudeAnalyser(): void {
    if (!this.stream) return;
    if (this.analyser) return; // already attached
    const Ctor = resolveAudioContextCtor();
    if (!Ctor) return;
    try {
      const ctx = new Ctor();
      const source = ctx.createMediaStreamSource(this.stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      this.audioContext = ctx;
      this.analyser = analyser;
      this.timeDomainData = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    } catch {
      // Leave fields null → getAmplitude() returns the static fallback.
      this.audioContext = null;
      this.analyser = null;
      this.timeDomainData = null;
    }
  }

  /**
   * Current microphone amplitude as a 0..1 RMS of the live time-domain signal.
   * Returns a static value (STATIC_AMPLITUDE) when no analyser is attached —
   * either the browser lacks AudioContext or initialize() has not (yet) run —
   * so the breathing ring degrades to a calm resting radius instead of throwing.
   * Cheap enough to call every requestAnimationFrame from a local rAF loop.
   */
  getAmplitude(): number {
    if (!this.analyser || !this.timeDomainData) return STATIC_AMPLITUDE;
    this.analyser.getByteTimeDomainData(this.timeDomainData);
    return rmsFromTimeDomain(this.timeDomainData);
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
    // Tear down the amplitude analyser first. Closing the context releases the
    // analyser + media-stream source regardless of stream ownership (the
    // analyser only reads the signal; closing it never stops the proctoring
    // track). close() can reject if already closed — ignore.
    if (this.audioContext) {
      const ctx = this.audioContext;
      if (ctx.state !== 'closed' && typeof ctx.close === 'function') {
        void Promise.resolve(ctx.close()).catch(() => {});
      }
    }
    this.audioContext = null;
    this.analyser = null;
    this.timeDomainData = null;

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
