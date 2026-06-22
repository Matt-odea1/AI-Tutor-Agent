import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AudioRecorder, {
  rmsFromTimeDomain,
  resolveAudioContextCtor,
  STATIC_AMPLITUDE,
} from '../services/audio';

describe('rmsFromTimeDomain', () => {
  it('returns 0 for an empty frame', () => {
    expect(rmsFromTimeDomain(new Uint8Array(0))).toBe(0);
  });

  it('returns ~0 for pure silence (all samples at the 128 midpoint)', () => {
    const silence = new Uint8Array(2048).fill(128);
    expect(rmsFromTimeDomain(silence)).toBeCloseTo(0, 6);
  });

  it('returns 1 for a full-scale square wave (samples at the rail)', () => {
    // Half at 0 (deviation -1), half at 255≈+1 → RMS ≈ 1.
    const data = new Uint8Array(2048);
    for (let i = 0; i < data.length; i++) data[i] = i % 2 === 0 ? 0 : 255;
    expect(rmsFromTimeDomain(data)).toBeCloseTo(1, 1);
  });

  it('returns a mid value between silence and full-scale', () => {
    // Constant deviation of 64/128 = 0.5 → RMS exactly 0.5.
    const data = new Uint8Array(1024).fill(128 + 64);
    expect(rmsFromTimeDomain(data)).toBeCloseTo(0.5, 6);
  });

  it('never exceeds 1 even with out-of-range deviation', () => {
    const data = new Uint8Array(16).fill(0); // deviation -1 everywhere
    const v = rmsFromTimeDomain(data);
    expect(v).toBeLessThanOrEqual(1);
    expect(v).toBeGreaterThan(0);
  });
});

describe('resolveAudioContextCtor', () => {
  const original = globalThis.window;
  afterEach(() => {
    globalThis.window = original;
  });

  it('returns the standard AudioContext when present', () => {
    class FakeCtx {}
    // @ts-expect-error test stub
    globalThis.window = { AudioContext: FakeCtx };
    expect(resolveAudioContextCtor()).toBe(FakeCtx);
  });

  it('falls back to webkitAudioContext (Safari)', () => {
    class WebkitCtx {}
    // @ts-expect-error test stub
    globalThis.window = { webkitAudioContext: WebkitCtx };
    expect(resolveAudioContextCtor()).toBe(WebkitCtx);
  });

  it('returns null when neither is available', () => {
    // @ts-expect-error test stub
    globalThis.window = {};
    expect(resolveAudioContextCtor()).toBeNull();
  });
});

describe('AudioRecorder.getAmplitude', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the static fallback before initialize() runs', () => {
    const rec = new AudioRecorder();
    expect(rec.getAmplitude()).toBe(STATIC_AMPLITUDE);
  });

  it('returns the static fallback when no AudioContext exists (jsdom default)', async () => {
    // jsdom provides no AudioContext, so the analyser never attaches.
    const ownTrack = {
      readyState: 'live' as MediaStreamTrackState,
      kind: 'audio',
      stop: vi.fn(),
    } as unknown as MediaStreamTrack;
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [ownTrack] });

    class FakeMediaRecorder {
      static isTypeSupported() {
        return true;
      }
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      state = 'inactive';
      mimeType = 'audio/webm';
      start() {}
      stop() {}
    }
    // @ts-expect-error test stub
    globalThis.MediaRecorder = FakeMediaRecorder;
    // @ts-expect-error test stub
    globalThis.navigator = { mediaDevices: { getUserMedia } };

    const rec = new AudioRecorder();
    await rec.initialize();
    expect(rec.getAmplitude()).toBe(STATIC_AMPLITUDE);
    // cleanup() with no attached context must not throw.
    expect(() => rec.cleanup()).not.toThrow();
  });
});
