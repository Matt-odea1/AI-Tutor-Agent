/**
 * S3 Upload Service - Handles audio file uploads
 */

import { getUploadUrl, uploadAudioToS3 } from './api';

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

/**
 * Upload a media blob (audio or video) to S3 via a presigned URL.
 * Returns the permanent S3 file URL.
 */
async function uploadMedia(
  blob: Blob,
  filename: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<string> {
  const { uploadUrl, fileUrl } = await getUploadUrl(filename, blob.type);
  await uploadAudioToS3(uploadUrl, blob, (percentage) => {
    if (onProgress) {
      onProgress({
        loaded: (blob.size * percentage) / 100,
        total: blob.size,
        percentage,
      });
    }
  });
  return fileUrl;
}

/**
 * Upload audio blob to S3 and return the file URL
 */
export async function uploadAudio(
  audioBlob: Blob,
  studentId: string,
  questionId: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<string> {
  try {
    const ext = audioBlob.type.includes('mp4') ? 'mp4' : audioBlob.type.includes('ogg') ? 'ogg' : 'webm';
    const filename = `audio/${studentId}/${questionId}_${Date.now()}.${ext}`;
    return await uploadMedia(audioBlob, filename, onProgress);
  } catch (error) {
    console.error('Failed to upload audio:', error);
    if (error instanceof Error) {
      if (error.message.includes('too large') || error.message.includes('Maximum size')) {
        throw error; // Already a descriptive validation error
      }
      if (error.message.includes('Network Error') || error.message.includes('ERR_NETWORK') || error.message === 'Failed to fetch') {
        throw new Error('Network error: please check your internet connection and try again.');
      }
      if (error.message.includes('timeout') || error.message.includes('Timeout')) {
        throw new Error('Upload timed out. Please check your connection and try again.');
      }
      if (error.message.includes('403') || error.message.includes('Forbidden')) {
        throw new Error('Upload authorization expired. Please try again.');
      }
    }
    throw new Error('Failed to upload audio file. Please try again.');
  }
}

/**
 * Upload video blob to S3 and return the file URL
 */
export async function uploadVideo(
  videoBlob: Blob,
  studentId: string,
  questionId: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<string> {
  try {
    const ext = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
    const filename = `video/${studentId}/${questionId}_${Date.now()}.${ext}`;
    return await uploadMedia(videoBlob, filename, onProgress);
  } catch (error) {
    console.error('Failed to upload video:', error);
    throw new Error('Failed to upload video file. Please try again.');
  }
}

/**
 * Validate audio blob before upload
 */
export function validateAudioBlob(blob: Blob, maxSizeMB: number = 50): boolean {
  if (!blob || blob.size === 0) {
    throw new Error('Audio recording is empty');
  }

  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (blob.size > maxSizeBytes) {
    throw new Error(`Audio file is too large. Maximum size is ${maxSizeMB}MB`);
  }

  if (!blob.type.includes('audio')) {
    throw new Error('Invalid audio format');
  }

  return true;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

export default {
  uploadAudio,
  uploadVideo,
  validateAudioBlob,
  formatFileSize,
};
