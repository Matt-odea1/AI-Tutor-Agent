/**
 * Video Recording Service - Handles browser MediaRecorder API for video+audio
 */

export class VideoRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private videoChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private ownsStream: boolean = false; // true only if we called getUserMedia ourselves
  private startTime: number = 0;
  private pausedTime: number = 0;
  private mimeType: string = '';

  /**
   * Initialize the recorder.
   *
   * @param existingStream - Pass a pre-existing MediaStream (e.g. the proctoring
   *   stream) to avoid requesting a second camera permission. The stream will NOT
   *   be stopped when cleanup() is called. If omitted, getUserMedia is called and
   *   the resulting stream IS stopped on cleanup.
   */
  async initialize(existingStream?: MediaStream): Promise<MediaStream> {
    try {
      if (existingStream) {
        this.stream = existingStream;
        this.ownsStream = false;
      } else {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        this.ownsStream = true;
      }

      this.mimeType = this.getSupportedMimeType();
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: this.mimeType || undefined,
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.videoChunks.push(event.data);
        }
      };

      return this.stream;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          throw new Error('Camera/microphone permission denied. Please allow access to record a video answer.');
        } else if (error.name === 'NotFoundError') {
          throw new Error('No camera found. Please connect a camera and try again.');
        }
        throw new Error(`Failed to initialize video recorder: ${error.message}`);
      }
      throw error;
    }
  }

  private getSupportedMimeType(): string {
    const types = [
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4',
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
  }

  start(): void {
    if (!this.mediaRecorder) throw new Error('Video recorder not initialized');
    if (this.mediaRecorder.state === 'recording') return;

    this.videoChunks = [];
    this.startTime = Date.now();
    this.mediaRecorder.start(100);
  }

  async stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('Video recorder not initialized'));
        return;
      }
      if (this.mediaRecorder.state === 'inactive') {
        reject(new Error('Recorder is not active'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.videoChunks, {
          type: this.mimeType || 'video/webm',
        });
        if (blob.size === 0) {
          reject(new Error('Recording failed — no video data captured'));
          return;
        }
        resolve(blob);
      };

      this.mediaRecorder.stop();
    });
  }

  pause(): void {
    if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') return;
    this.mediaRecorder.pause();
    this.pausedTime = Date.now();
  }

  resume(): void {
    if (!this.mediaRecorder || this.mediaRecorder.state !== 'paused') return;
    this.mediaRecorder.resume();
    this.startTime += Date.now() - this.pausedTime;
  }

  getDuration(): number {
    if (!this.startTime) return 0;
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  getState(): 'inactive' | 'recording' | 'paused' {
    return this.mediaRecorder?.state || 'inactive';
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  getMimeType(): string {
    return this.mimeType || 'video/webm';
  }

  getFileExtension(): string {
    if (this.mimeType.includes('mp4')) return 'mp4';
    return 'webm';
  }

  createVideoUrl(blob: Blob): string {
    return URL.createObjectURL(blob);
  }

  releaseVideoUrl(url: string): void {
    URL.revokeObjectURL(url);
  }

  cleanup(): void {
    // Only stop tracks if we own this stream (i.e. we called getUserMedia).
    // If the stream was shared from proctoring, the proctoring recorder owns it.
    if (this.stream && this.ownsStream) {
      this.stream.getTracks().forEach((track) => track.stop());
    }
    this.stream = null;
    this.ownsStream = false;
    this.mediaRecorder = null;
    this.videoChunks = [];
    this.startTime = 0;
    this.pausedTime = 0;
  }

  static isSupported(): boolean {
    return !!(
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      window.MediaRecorder
    );
  }
}

export default VideoRecorder;
