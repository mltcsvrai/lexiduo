import { useState, useCallback } from 'react';
import { 
  extractYouTubeId, 
  fetchYouTubeMetadata, 
  fetchVideoSubtitles, 
  checkFloatingPermissions, 
  startFloatingOverlay, 
  useTranslation, 
  type SubtitleCue 
} from '@ytceviri/core';

export interface PendingYouTubeVideo {
  videoId: string;
  rawText: string;
  title?: string;
}

export interface UseYouTubePlaybackFlowParams {
  cues: SubtitleCue[];
  currentVideoId: string;
  apiKey: string;
  sourceLang: string;
  targetLang: string;
  onExecuteInApp: (videoId: string, title?: string) => void;
  onOpenPermissionGuide: () => void;
  onSubtitlesLoaded?: (cues: SubtitleCue[]) => void;
}

export function useYouTubePlaybackFlow({
  cues,
  currentVideoId,
  apiKey,
  sourceLang,
  targetLang,
  onExecuteInApp,
  onOpenPermissionGuide,
  onSubtitlesLoaded,
}: UseYouTubePlaybackFlowParams) {
  const { t } = useTranslation();
  const [pendingVideo, setPendingVideo] = useState<PendingYouTubeVideo | null>(null);
  const [isChoiceModalOpen, setIsChoiceModalOpen] = useState(false);
  const [isPreparingSubtitles, setIsPreparingSubtitles] = useState(false);

  // Trigger modal when a YouTube video is loaded from any channel
  const initiatePlaybackChoice = useCallback((urlOrId: string) => {
    const extracted = extractYouTubeId(urlOrId);
    if (!extracted) {
      alert(t('invalidYoutubeUrl'));
      return;
    }

    setPendingVideo({ videoId: extracted, rawText: urlOrId });
    setIsChoiceModalOpen(true);

    // Fetch title asynchronously in background for modal header
    fetchYouTubeMetadata(extracted).then((meta) => {
      if (meta && meta.title) {
        setPendingVideo(prev => prev && prev.videoId === extracted ? { ...prev, title: meta.title } : prev);
      }
    }).catch(() => {});
  }, [t]);

  // Option 1: Stay in App
  const confirmStayInApp = useCallback(() => {
    if (!pendingVideo) return;
    const { videoId, title } = pendingVideo;
    setIsChoiceModalOpen(false);
    setPendingVideo(null);
    onExecuteInApp(videoId, title);
  }, [pendingVideo, onExecuteInApp]);

  // Option 2: Continue on YouTube with Floating Subtitles
  const confirmContinueOnYouTube = useCallback(async () => {
    if (!pendingVideo) return;
    const targetVideoId = pendingVideo.videoId;

    let targetCues: SubtitleCue[] = [];
    if (targetVideoId === currentVideoId && cues.length > 0) {
      targetCues = cues;
    }

    try {
      setIsPreparingSubtitles(true);

      // If subtitles are not in memory, fetch them now
      if (targetCues.length === 0) {
        const result = await fetchVideoSubtitles(targetVideoId, sourceLang, targetLang, apiKey);
        if (result && result.cues && result.cues.length > 0) {
          targetCues = result.cues;
          onSubtitlesLoaded?.(targetCues);
        }
      }

      // Check overlay permissions
      const perms = await checkFloatingPermissions();
      if (!perms.overlay) {
        setIsChoiceModalOpen(false);
        setPendingVideo(null);
        onOpenPermissionGuide();
      } else {
        await startFloatingOverlay(targetCues, targetVideoId);
        setIsChoiceModalOpen(false);
        setPendingVideo(null);
      }
    } catch (err) {
      console.error('Failed to launch YouTube with floating overlay:', err);
      // Fallback: If permissions fail, show guide
      setIsChoiceModalOpen(false);
      setPendingVideo(null);
      onOpenPermissionGuide();
    } finally {
      setIsPreparingSubtitles(false);
    }
  }, [
    pendingVideo, 
    currentVideoId, 
    cues, 
    sourceLang, 
    targetLang, 
    apiKey, 
    onOpenPermissionGuide, 
    onSubtitlesLoaded
  ]);

  const closeChoiceModal = useCallback(() => {
    if (isPreparingSubtitles) return;
    setIsChoiceModalOpen(false);
    setPendingVideo(null);
  }, [isPreparingSubtitles]);

  return {
    pendingVideo,
    isChoiceModalOpen,
    isPreparingSubtitles,
    initiatePlaybackChoice,
    confirmStayInApp,
    confirmContinueOnYouTube,
    closeChoiceModal,
  };
}
