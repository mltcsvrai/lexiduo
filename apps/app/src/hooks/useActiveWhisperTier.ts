import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getActiveWhisperTier,
  getWhisperTierStatus,
  WHISPER_TIERS,
  WHISPER_TIER_CHANGED_EVENT,
  type WhisperTierKey,
} from '../services/offlineTranslationEngine';

export interface ActiveWhisperTierState {
  activeTierId: string;
  activeWhisperTierName: string;
  isWhisperDownloaded: boolean;
  refreshStatus: () => Promise<void>;
}

export function useActiveWhisperTier(): ActiveWhisperTierState {
  const [activeTierId, setActiveTierId] = useState<string>('tiny');
  const [activeWhisperTierName, setActiveWhisperTierName] = useState<string>('Whisper AI');
  const [isWhisperDownloaded, setIsWhisperDownloaded] = useState<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  const refreshStatus = useCallback(async () => {
    try {
      const tierId = await getActiveWhisperTier();
      const tierConfig = WHISPER_TIERS[tierId as WhisperTierKey] || WHISPER_TIERS.tiny;
      const status = await getWhisperTierStatus(tierId);
      if (isMountedRef.current) {
        setActiveTierId(tierId);
        setActiveWhisperTierName(tierConfig.name);
        setIsWhisperDownloaded(status.isDownloaded);
      }
    } catch (e) {
      console.warn('Failed to refresh active Whisper tier status:', e);
      if (isMountedRef.current) {
        setActiveTierId('tiny');
        setActiveWhisperTierName('Whisper Tiny');
        setIsWhisperDownloaded(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    refreshStatus();
    if (typeof window === 'undefined') {
      return () => {
        isMountedRef.current = false;
      };
    }

    const handleTierChange = () => {
      refreshStatus();
    };

    window.addEventListener(WHISPER_TIER_CHANGED_EVENT, handleTierChange);
    return () => {
      isMountedRef.current = false;
      window.removeEventListener(WHISPER_TIER_CHANGED_EVENT, handleTierChange);
    };
  }, [refreshStatus]);

  return {
    activeTierId,
    activeWhisperTierName,
    isWhisperDownloaded,
    refreshStatus,
  };
}
