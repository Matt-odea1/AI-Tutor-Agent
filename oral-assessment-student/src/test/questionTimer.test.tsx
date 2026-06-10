import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import QuestionTimer from '../components/QuestionTimer';

// QuestionTimer drives the single oral answer clock. These cover the double-fire
// guard and the pause-awareness added so the header and recorder never diverge.
describe('QuestionTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('fires onExpire exactly once at zero and never double-fires', () => {
    const onExpire = vi.fn();
    render(<QuestionTimer timeLimitSeconds={3} resetKey="q1" onExpire={onExpire} />);

    act(() => { vi.advanceTimersByTime(3500); });
    expect(onExpire).toHaveBeenCalledTimes(1);

    // Keep ticking well past expiry — the expiredRef guard must hold.
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('freezes while paused and resumes without burning recording time', () => {
    const onExpire = vi.fn();
    const { rerender } = render(
      <QuestionTimer timeLimitSeconds={3} resetKey="q1" onExpire={onExpire} paused={false} />
    );

    act(() => { vi.advanceTimersByTime(1000); }); // 2s of the 3s budget left

    // Pause for a long time — must NOT expire while paused.
    rerender(<QuestionTimer timeLimitSeconds={3} resetKey="q1" onExpire={onExpire} paused={true} />);
    act(() => { vi.advanceTimersByTime(10000); });
    expect(onExpire).not.toHaveBeenCalled();

    // Resume — the remaining ~2s should still be available (paused time excluded).
    rerender(<QuestionTimer timeLimitSeconds={3} resetKey="q1" onExpire={onExpire} paused={false} />);
    act(() => { vi.advanceTimersByTime(1500); });
    expect(onExpire).not.toHaveBeenCalled(); // still ~0.5s left

    act(() => { vi.advanceTimersByTime(1000); }); // now past the remaining budget
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
