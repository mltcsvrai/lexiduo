import { registerPlugin } from '@capacitor/core';

export interface BackgroundTaskPlugin {
  startTask(options: { id: string; title: string; message?: string; progress?: number }): Promise<void>;
  updateTask(options: { id: string; message?: string; progress?: number }): Promise<void>;
  finishTask(options: { id: string }): Promise<void>;
  isTaskRunning(options: { id: string }): Promise<{ running: boolean }>;
}

export interface BackgroundTaskState {
  id: string;
  title: string;
  message?: string;
  progress?: number;
}

// In-memory mock store for web / non-native environments
const mockTasks = new Map<string, BackgroundTaskState>();

export const BackgroundTask = registerPlugin<BackgroundTaskPlugin>('BackgroundTask', {
  web: () => ({
    async startTask(options: { id: string; title: string; message?: string; progress?: number }): Promise<void> {
      mockTasks.set(options.id, { ...options });
    },
    async updateTask(options: { id: string; message?: string; progress?: number }): Promise<void> {
      const existing = mockTasks.get(options.id);
      if (existing) {
        if (options.message !== undefined) existing.message = options.message;
        if (options.progress !== undefined) existing.progress = options.progress;
      }
    },
    async finishTask(options: { id: string }): Promise<void> {
      mockTasks.delete(options.id);
    },
    async isTaskRunning(options: { id: string }): Promise<{ running: boolean }> {
      return { running: mockTasks.has(options.id) };
    }
  })
});

/**
 * Returns current in-memory mock task state (web / test environment).
 */
export function getBackgroundTaskMockState(id: string): BackgroundTaskState | undefined {
  const task = mockTasks.get(id);
  return task ? { ...task } : undefined;
}

interface ThrottleRecord {
  lastUpdateTime: number;
  lastProgress?: number;
}

// Map tracking throttle timing and progress per task ID
const throttleMap = new Map<string, ThrottleRecord>();

const THROTTLE_INTERVAL_MS = 400;
const MIN_PROGRESS_DELTA = 4;

/**
 * Starts a native foreground service background task with notification.
 */
export async function startBackgroundTask(
  id: string,
  title: string,
  message?: string,
  progress?: number
): Promise<void> {
  throttleMap.set(id, {
    lastUpdateTime: Date.now(),
    lastProgress: progress
  });

  try {
    await BackgroundTask.startTask({ id, title, message, progress });
  } catch (err) {
    console.warn(`[BackgroundTask] startTask failed for task '${id}':`, err);
  }
}

/**
 * Updates a background task's notification progress and message.
 * Throttles notifications to prevent system spam:
 * Skips the call if less than 400ms has elapsed since the last update
 * AND progress delta is less than 4% (unless progress is 100%).
 */
export async function updateBackgroundTask(
  id: string,
  message?: string,
  progress?: number
): Promise<void> {
  const now = Date.now();
  const throttleRecord = throttleMap.get(id);

  if (throttleRecord) {
    const elapsed = now - throttleRecord.lastUpdateTime;
    const progressDiff =
      progress !== undefined && throttleRecord.lastProgress !== undefined
        ? Math.abs(progress - throttleRecord.lastProgress)
        : progress !== undefined
        ? progress
        : 0;

    const isCompleted = progress !== undefined && progress >= 100;

    // Son güncellemeden 400ms geçmediyse ve ilerleme değişimi <%4 ise (ve %100 değilse) çağrıyı atla.
    if (!isCompleted && elapsed < THROTTLE_INTERVAL_MS && progressDiff < MIN_PROGRESS_DELTA) {
      return;
    }
  }

  throttleMap.set(id, {
    lastUpdateTime: now,
    lastProgress: progress !== undefined ? progress : throttleRecord?.lastProgress
  });

  try {
    await BackgroundTask.updateTask({ id, message, progress });
  } catch (err) {
    console.warn(`[BackgroundTask] updateTask failed for task '${id}':`, err);
  }
}

/**
 * Finishes a background task and dismisses the foreground service notification.
 */
export async function finishBackgroundTask(id: string): Promise<void> {
  throttleMap.delete(id);

  try {
    await BackgroundTask.finishTask({ id });
  } catch (err) {
    console.warn(`[BackgroundTask] finishTask failed for task '${id}':`, err);
  }
}

/**
 * Checks if a background task is actively running.
 */
export async function isBackgroundTaskRunning(id: string): Promise<boolean> {
  try {
    const result = await BackgroundTask.isTaskRunning({ id });
    return !!result.running;
  } catch (err) {
    console.warn(`[BackgroundTask] isTaskRunning failed for task '${id}':`, err);
    return false;
  }
}

/**
 * Executes an async task wrapped in a native background foreground service.
 * Automatically guarantees finishTask is called in a finally block so the service
 * never remains active if an error or exception occurs.
 */
export async function withBackgroundTask<T>(
  id: string,
  title: string,
  taskFn: (update: (msg?: string, progress?: number) => void) => Promise<T>
): Promise<T> {
  await startBackgroundTask(id, title);

  const updateCallback = (msg?: string, progress?: number) => {
    void updateBackgroundTask(id, msg, progress);
  };

  try {
    return await taskFn(updateCallback);
  } finally {
    try {
      await finishBackgroundTask(id);
    } catch (err) {
      console.warn(`[BackgroundTask] finishBackgroundTask failed in finally for task '${id}':`, err);
    }
  }
}
