import { useState, useCallback } from 'react';
import { 
  extractYouTubeId, 
  fetchYouTubeMetadata, 
  fetchVideoSubtitles, 
  checkFloatingPermissions, 
  startFloatingOverlay, 
  loadFloatingCues,
  useTranslation, 
  type SubtitleCue 
} from '@lexiduo/core';

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
  initialPendingVideo?: PendingYouTubeVideo | null;
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
  initialPendingVideo = null,
}: UseYouTubePlaybackFlowParams) {
  const { t } = useTranslation();
  const [pendingVideo, setPendingVideo] = useState<PendingYouTubeVideo | null>(initialPendingVideo);
  const [isChoiceModalOpen, setIsChoiceModalOpen] = useState(Boolean(initialPendingVideo));
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

    let isBgFetching = false;
    try {
      setIsPreparingSubtitles(true);

      // Check overlay permissions immediately
      const perms = await checkFloatingPermissions();
      if (!perms.overlay) {
        setIsChoiceModalOpen(false);
        setPendingVideo(null);
        onOpenPermissionGuide();
        return;
      }

      // Close modal immediately so UI is not blocked
      setIsChoiceModalOpen(false);
      setPendingVideo(null);

      // Launch YouTube app and floating overlay immediately (within milliseconds)
      await startFloatingOverlay(targetCues.length > 0 ? targetCues : undefined, targetVideoId);

      // If subtitles are not in memory, stream and fetch them in background without blocking
      if (targetCues.length === 0) {
        isBgFetching = true;
        fetchVideoSubtitles(
          targetVideoId,
          sourceLang,
          targetLang,
          apiKey,
          async (fastCues) => {
            if (fastCues && fastCues.length > 0) {
              await loadFloatingCues(fastCues);
            }
          }
        )
          .then(async (result) => {
            if (result?.cues && result.cues.length > 0) {
              await loadFloatingCues(result.cues);
              onSubtitlesLoaded?.(result.cues);
            }
          })
          .catch((err) => {
            console.error('Failed to fetch subtitles in background for floating overlay:', err);
          })
          .finally(() => {
            setIsPreparingSubtitles(false);
          });
      }
    } catch (err) {
      console.error('Failed to launch YouTube with floating overlay:', err);
      // Fallback: If permissions fail or launch errors, show guide
      setIsChoiceModalOpen(false);
      setPendingVideo(null);
      onOpenPermissionGuide();
    } finally {
      if (!isBgFetching) {
        setIsPreparingSubtitles(false);
      }
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
