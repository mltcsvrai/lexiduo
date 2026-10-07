import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../../store/useAppStore';
import { HISTORY_LIMIT_OPTIONS, HISTORY_LIMIT_DEFAULT } from '../../types';

describe('HistoryLimitPicker store integration', () => {
  beforeEach(() => {
    useAppStore.setState({ historyLimit: HISTORY_LIMIT_DEFAULT });
  });

  it('initializes with default historyLimit of 6', () => {
    const current = useAppStore.getState().historyLimit;
    expect(current).toBe(6);
  });

  it('updates historyLimit in store to all valid options', () => {
    for (const opt of HISTORY_LIMIT_OPTIONS) {
      useAppStore.getState().setHistoryLimit(opt);
      expect(useAppStore.getState().historyLimit).toBe(opt);
    }
  });

  it('supports selecting 4, 6, 8, 10, 12, 16, and 20 videos', () => {
    expect(HISTORY_LIMIT_OPTIONS).toEqual([4, 6, 8, 10, 12, 16, 20]);
  });
});
