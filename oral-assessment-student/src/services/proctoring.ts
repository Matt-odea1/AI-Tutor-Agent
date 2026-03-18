/**
 * Proctoring Service - Continuous background camera recording in 30s chunks
 *
 * Flow:
 *  1. startProctoring(stream) — attach the live camera stream, begin chunked recording
 *  2. Every 30 seconds MediaRecorder fires ondataavailable → uploadChunk()
 *  3. uploadChunk uploads to S3 (presigned URL) then POSTs manifest to backend
 *  4. stopProctoring() stops the recorder and uploads any remaining data
 *  5. onPermissionRevoked callback fires if any track ends unexpectedly
 */

import { getUploadUrl, uploadAudioToS3, submitProctorChunk } from './api';

export interface ProctoringOptions {
  studentId: string;
  assessmentId: string;
  onPermissionRevoked?: () => void;
  onChunkUploaded?: (chunkIndex: number) => void;
  onError?: (error: Error) => void;
}

const CHUNK_INTERVAL_MS = 30_000; // 30 seconds

export class ProctoringRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunkIndex = 0;
  private options: ProctoringOptions;
  private uploadQueue: Promise<void> = Promise.resolve();
  private stopped = false;

  constructor(options: ProctoringOptions) {
    this.options = options;
  }

  /**
   * Begin chunked proctoring. Pass the existing camera stream (from VideoRecorder
   * or a dedicated getUserMedia call). The stream is not owned by this class and
   * will NOT be stopped when stopProctoring() is called.
   */
  start(stream: MediaStream): void {
    if (this.mediaRecorder) return; // already started

    const mimeType = this.getSupportedMimeType();

    this.mediaRecorder = new MediaRecorder(stream, {
      mimeType: mimeType || undefined,
    });

    // Watch for tracks ending (permission revoked by OS/browser)
    stream.getTracks().forEach((track) => {
      track.onended = () => {
        if (!this.stopped) {
          this.options.onPermissionRevoked?.();
        }
      };
    });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0 && !this.stopped) {
        const index = this.chunkIndex++;
        const blob = new Blob([event.data], { type: mimeType || 'video/webm' });
        // Queue uploads sequentially to avoid race conditions on chunk_index
        this.uploadQueue = this.uploadQueue.then(() =>
          this.uploadChunk(blob, index)
        );
      }
    };

    // timeslice causes ondataavailable every 30s while recording
    this.mediaRecorder.start(CHUNK_INTERVAL_MS);
  }

  stop(): void {
    this.stopped = true;
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  /** Wait for all in-flight uploads to complete. */
  async drain(): Promise<void> {
    await this.uploadQueue;
  }

  private async uploadChunk(blob: Blob, index: number): Promise<void> {
    const { studentId, assessmentId } = this.options;
    try {
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
      const filename = `proctoring/${assessmentId}/${studentId}/chunk_${String(index).padStart(6, '0')}.${ext}`;

      const { uploadUrl, fileUrl } = await getUploadUrl(filename, blob.type);
      await uploadAudioToS3(uploadUrl, blob);

      await submitProctorChunk(studentId, assessmentId, fileUrl, index);

      this.options.onChunkUploaded?.(index);
    } catch (error) {
      this.options.onError?.(
        error instanceof Error ? error : new Error('Chunk upload failed')
      );
    }
  }

  private getSupportedMimeType(): string {
    const types = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
  }
}

export default ProctoringRecorder;
