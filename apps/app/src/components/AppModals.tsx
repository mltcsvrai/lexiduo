import React, { Suspense, lazy } from 'react';
import { 
  ApiKeyModal,
  SubtitleSettingsModal,
  DownloadSubtitlesModal,
  FloatingPermissionGuideModal,
  startFloatingOverlay, 
  FloatingSubtitle,
  type SubtitleCue 
} from '@ytceviri/core';
import { WhisperProcessingCard } from './WhisperProcessingCard';
import { OfflineModelSection } from './OfflineModelSection';
import type { WhisperProgress } from '../services/whisperEngine';

const YouTubePlaybackChoiceModal = lazy(() => import('./YouTubePlaybackChoiceModal').then(m => ({ default: m.YouTubePlaybackChoiceModal })));
const YouTubeWhisperModal = lazy(() => import('./YouTubeWhisperModal').then(m => ({ default: m.YouTubeWhisperModal })));
const LocalProcessingChoiceModal = lazy(() => import('./LocalProcessingChoiceModal').then(m => ({ default: m.LocalProcessingChoiceModal })));

export interface AppModalsProps {
  // Settings & Appearance
  isSettingsOpen: boolean;
  setIsSettingsOpen: (isOpen: boolean) => void;
  apiKey: string;
  onSaveApiKey: (key: string) => void;
  isSubtitleSettingsOpen: boolean;
  setIsSubtitleSettingsOpen: (isOpen: boolean) => void;
  isDownloadModalOpen: boolean;
  setIsDownloadModalOpen: (isOpen: boolean) => void;

  // Video context
  videoId: string;
  ytVideoTitle: string;
  videoFile: File | null;
  cues: SubtitleCue[];
  sourceLang: string;
  targetLang: string;

  // Whisper & Processing
  activeWhisperTierName: string;
  isWhisperDownloaded: boolean;
  refreshWhisperStatus: () => void;
  isYtWhisperModalOpen: boolean;
  setIsYtWhisperModalOpen: (isOpen: boolean) => void;
  onExecuteYouTubeAudio: (mode: 'whisper' | 'gemini', key?: string) => void;

  // Local processing choice
  pendingLocalFile: File | null;
  setPendingLocalFile: (file: File | null) => void;
  isChoiceModalOpen: boolean;
  setIsChoiceModalOpen: (isOpen: boolean) => void;
  onExecuteLocalProcessing: (file: File, mode: 'whisper' | 'gemini', key?: string) => void;

  // Floating Permission Guide
  isFloatingGuideOpen: boolean;
  setIsFloatingGuideOpen: (isOpen: boolean) => void;

  // YouTube Choice flow
  isYtPlaybackChoiceOpen: boolean;
  pendingYtVideo: { videoId: string; title?: string } | null;
  isPreparingYtFloatingSubtitles: boolean;
  onConfirmStayInApp: () => void;
  onConfirmContinueOnYouTube: () => void;
  onCloseYtChoiceModal: () => void;

  // Audio processing card indicator
  isProcessing: boolean;
  whisperProgress: WhisperProgress | null;
  statusText: string;
  progressPercent: number;
}

export const AppModals: React.FC<AppModalsProps> = ({
  isSettingsOpen,
  setIsSettingsOpen,
  apiKey,
  onSaveApiKey,
  isSubtitleSettingsOpen,
  setIsSubtitleSettingsOpen,
  isDownloadModalOpen,
  setIsDownloadModalOpen,
  videoId,
  ytVideoTitle,
  videoFile,
  cues,
  sourceLang,
  targetLang,
  activeWhisperTierName,
  isWhisperDownloaded,
  refreshWhisperStatus,
  isYtWhisperModalOpen,
  setIsYtWhisperModalOpen,
  onExecuteYouTubeAudio,
  pendingLocalFile,
  setPendingLocalFile,
  isChoiceModalOpen,
  setIsChoiceModalOpen,
  onExecuteLocalProcessing,
  isFloatingGuideOpen,
  setIsFloatingGuideOpen,
  isYtPlaybackChoiceOpen,
  pendingYtVideo,
  isPreparingYtFloatingSubtitles,
  onConfirmStayInApp,
  onConfirmContinueOnYouTube,
  onCloseYtChoiceModal,
  isProcessing,
  whisperProgress,
  statusText,
  progressPercent,
}) => {
  return (
    <>
      <Suspense fallback={null}>
        {/* Settings Modal (API Key, Language & History Limits) */}
        {isSettingsOpen && (
          <ApiKeyModal 
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            currentKey={apiKey}
            onSave={onSaveApiKey}
            extraSections={<OfflineModelSection />}
          />
        )}

        {/* Subtitle Appearance & Style Modal */}
        {isSubtitleSettingsOpen && (
          <SubtitleSettingsModal
            isOpen={isSubtitleSettingsOpen}
            onClose={() => setIsSubtitleSettingsOpen(false)}
            onWhisperClick={videoId ? () => { refreshWhisperStatus(); setIsYtWhisperModalOpen(true); } : undefined}
          />
        )}

        {/* Download Video with Soft-Subtitles Modal */}
        {isDownloadModalOpen && (
          <DownloadSubtitlesModal
            isOpen={isDownloadModalOpen}
            onClose={() => setIsDownloadModalOpen(false)}
            videoTitle={ytVideoTitle || videoFile?.name}
            videoFile={videoFile}
          />
        )}

        {/* YouTube Playback Choice Modal */}
        {isYtPlaybackChoiceOpen && (
          <YouTubePlaybackChoiceModal
            isOpen={isYtPlaybackChoiceOpen}
            videoId={pendingYtVideo?.videoId || null}
            videoTitle={pendingYtVideo?.title}
            isPreparingSubtitles={isPreparingYtFloatingSubtitles}
            onStayInApp={onConfirmStayInApp}
            onContinueOnYouTube={onConfirmContinueOnYouTube}
            onClose={onCloseYtChoiceModal}
          />
        )}

        {/* Native YouTube Floating Overlay Permission Modal */}
        {isFloatingGuideOpen && (
          <FloatingPermissionGuideModal 
            isOpen={isFloatingGuideOpen}
            onClose={() => setIsFloatingGuideOpen(false)}
            onLaunchFloating={async () => {
              if (videoId) {
                await startFloatingOverlay(cues, videoId);
              } else {
                await FloatingSubtitle.startAutoAssistant({ sourceLang, targetLang }).catch(() => {});
              }
            }}
          />
        )}

        {/* YouTube Subtitle Engine Choice Modal */}
        {isYtWhisperModalOpen && (
          <YouTubeWhisperModal
            isOpen={isYtWhisperModalOpen}
            videoTitle={ytVideoTitle}
            hasApiKey={Boolean(apiKey && apiKey.trim().length > 10)}
            activeWhisperTierName={activeWhisperTierName}
            isWhisperDownloaded={isWhisperDownloaded}
            onSelectWhisper={() => {
              if (!isWhisperDownloaded) {
                setIsYtWhisperModalOpen(false);
                setIsSettingsOpen(true);
                return;
              }
              onExecuteYouTubeAudio('whisper');
            }}
            onSelectCloudApi={(k) => onExecuteYouTubeAudio('gemini', k)}
            onClose={() => setIsYtWhisperModalOpen(false)}
          />
        )}

        {/* Local Video Processing Engine Choice Modal */}
        {pendingLocalFile && (
          <LocalProcessingChoiceModal
            isOpen={isChoiceModalOpen}
            fileName={pendingLocalFile.name}
            fileSizeMb={pendingLocalFile.size / (1024 * 1024)}
            hasApiKey={Boolean(apiKey && apiKey.trim().length > 10)}
            activeWhisperTierName={activeWhisperTierName}
            isWhisperDownloaded={isWhisperDownloaded}
            onSelectWhisper={() => {
              const f = pendingLocalFile;
              setIsChoiceModalOpen(false);
              setPendingLocalFile(null);
              if (!isWhisperDownloaded) {
                setIsSettingsOpen(true);
                return;
              }
              onExecuteLocalProcessing(f, 'whisper');
            }}
            onSelectCloudApi={(k) => {
              const f = pendingLocalFile;
              setIsChoiceModalOpen(false);
              setPendingLocalFile(null);
              onExecuteLocalProcessing(f, 'gemini', k);
            }}
            onClose={() => {
              setIsChoiceModalOpen(false);
              setPendingLocalFile(null);
            }}
          />
        )}
      </Suspense>

      {/* Audio Processing Indicator */}
      {isProcessing && videoId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <WhisperProcessingCard
            progress={whisperProgress}
            tierName={activeWhisperTierName}
            fallbackText={statusText}
            fallbackPercent={progressPercent}
          />
        </div>
      )}
    </>
  );
};
