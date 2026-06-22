import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { withRetry, isTransientError } from '../services/api';

// Build an AxiosError shaped like a real network error (request made, no response).
function networkError(): AxiosError {
  const err = new AxiosError('Network Error', 'ERR_NETWORK');
  // A network error has a request but no response.
  (err as unknown as { request: unknown }).request = {};
  return err;
}

function timeoutError(): AxiosError {
  return new AxiosError('timeout of 120000ms exceeded', 'ECONNABORTED');
}

function statusError(status: number): AxiosError {
  const err = new AxiosError(`HTTP ${status}`);
  err.response = {
    status,
    statusText: '',
    data: {},
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
  (err as unknown as { request: unknown }).request = {};
  return err;
}

beforeEach(() => {
  // Make backoff delays instant so the suite runs fast.
  vi.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
    fn();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout);
  // Deterministic jitter.
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isTransientError', () => {
  it('treats network errors as transient', () => {
    expect(isTransientError(networkError())).toBe(true);
  });

  it('treats ECONNABORTED (timeout) as transient', () => {
    expect(isTransientError(timeoutError())).toBe(true);
  });

  it('treats 5xx as transient', () => {
    expect(isTransientError(statusError(500))).toBe(true);
    expect(isTransientError(statusError(503))).toBe(true);
  });

  it('does NOT treat 4xx as transient', () => {
    for (const s of [400, 401, 403, 404, 409, 422]) {
      expect(isTransientError(statusError(s))).toBe(false);
    }
  });

  it('does NOT treat non-axios errors as transient', () => {
    expect(isTransientError(new Error('boom'))).toBe(false);
  });
});

describe('withRetry', () => {
  it('returns immediately on first success (no retries)', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(withRetry(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries a transient network error and succeeds on a later attempt', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(networkError())
      .mockResolvedValueOnce('ok');
    await expect(withRetry(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries a 5xx and succeeds on a later attempt', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(statusError(503))
      .mockResolvedValueOnce('ok');
    await expect(withRetry(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry a 4xx — fails immediately after one attempt', async () => {
    const err = statusError(422);
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('respects max attempts (1 initial + 2 retries = 3) then rethrows the last error', async () => {
    const err = networkError();
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('honors a custom retries count', async () => {
    const err = networkError();
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn, { retries: 5 })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(5);
  });

  it('rethrows the original error unchanged so handleApiError sees it', async () => {
    const err = statusError(404);
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn)).rejects.toBe(err);
  });
});
