import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  startBackgroundTask,
  updateBackgroundTask,
  finishBackgroundTask,
  isBackgroundTaskRunning,
  withBackgroundTask,
  getBackgroundTaskMockState
} from '../backgroundTaskManager';

describe('backgroundTaskManager', () => {
  const taskId = 'test-task-1';

  beforeEach(async () => {
    await finishBackgroundTask(taskId);
    vi.restoreAllMocks();
  });

  it('starts a background task and reports running status', async () => {
    expect(await isBackgroundTaskRunning(taskId)).toBe(false);

    await startBackgroundTask(taskId, 'Testing Task', 'Starting...', 0);
    expect(await isBackgroundTaskRunning(taskId)).toBe(true);

    const state = getBackgroundTaskMockState(taskId);
    expect(state).toBeDefined();
    expect(state?.title).toBe('Testing Task');
    expect(state?.message).toBe('Starting...');
    expect(state?.progress).toBe(0);

    await finishBackgroundTask(taskId);
    expect(await isBackgroundTaskRunning(taskId)).toBe(false);
    expect(getBackgroundTaskMockState(taskId)).toBeUndefined();
  });

  it('throttles updates when within 400ms and progress change is less than 4%', async () => {
    // Initial start at progress = 10%
    await startBackgroundTask(taskId, 'Throttled Task', 'Initial', 10);
    expect(getBackgroundTaskMockState(taskId)?.progress).toBe(10);
    expect(getBackgroundTaskMockState(taskId)?.message).toBe('Initial');

    // Call update within <400ms with +2% progress change (10 -> 12, delta < 4%)
    await updateBackgroundTask(taskId, 'Slight progress', 12);
    // Should be throttled: state remains as before
    expect(getBackgroundTaskMockState(taskId)?.progress).toBe(10);
    expect(getBackgroundTaskMockState(taskId)?.message).toBe('Initial');

    // Call update within <400ms with +5% progress change (10 -> 15 >= 4%)
    await updateBackgroundTask(taskId, 'Noticeable progress', 15);
    // Should NOT be throttled: delta is 5% >= 4%
    expect(getBackgroundTaskMockState(taskId)?.progress).toBe(15);
    expect(getBackgroundTaskMockState(taskId)?.message).toBe('Noticeable progress');

    // Call update with small delta (15 -> 16) but progress = 100%
    await updateBackgroundTask(taskId, 'Completed!', 100);
    // 100% should bypass throttling
    expect(getBackgroundTaskMockState(taskId)?.progress).toBe(100);
    expect(getBackgroundTaskMockState(taskId)?.message).toBe('Completed!');
  });

  it('allows updates after 400ms even with small progress change', async () => {
    await startBackgroundTask(taskId, 'Timed Task', 'Initial', 20);
    expect(getBackgroundTaskMockState(taskId)?.progress).toBe(20);

    // Advance time by 450ms
    const realDateNow = Date.now;
    const startTime = realDateNow();
    vi.spyOn(Date, 'now').mockReturnValue(startTime + 450);

    await updateBackgroundTask(taskId, 'Timed progress', 21);
    // Should NOT be throttled because elapsed >= 400ms
    expect(getBackgroundTaskMockState(taskId)?.progress).toBe(21);
    expect(getBackgroundTaskMockState(taskId)?.message).toBe('Timed progress');
  });

  it('runs withBackgroundTask and completes successfully', async () => {
    let callbackCalled = false;

    const result = await withBackgroundTask(taskId, 'Runner', async (update) => {
      expect(await isBackgroundTaskRunning(taskId)).toBe(true);
      update('Working...', 50);
      callbackCalled = true;
      return 42;
    });

    expect(result).toBe(42);
    expect(callbackCalled).toBe(true);
    expect(await isBackgroundTaskRunning(taskId)).toBe(false);
  });

  it('guarantees cleanup in withBackgroundTask finally block when an exception is thrown', async () => {
    let taskWasRunningDuringError = false;

    await expect(
      withBackgroundTask(taskId, 'Failing Task', async () => {
        taskWasRunningDuringError = await isBackgroundTaskRunning(taskId);
        throw new Error('Simulated failure during execution');
      })
    ).rejects.toThrow('Simulated failure during execution');

    expect(taskWasRunningDuringError).toBe(true);
    // Verified that finishBackgroundTask was called in finally
    expect(await isBackgroundTaskRunning(taskId)).toBe(false);
  });
});
