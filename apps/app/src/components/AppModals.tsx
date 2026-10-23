import React, { Suspense, lazy } from 'react';
import { 
  ApiKeyModal,
  SubtitleSettingsModal,
  DownloadSubtitlesModal,
  FloatingPermissionGuideModal,
  startFloatingOverlay, 
  FloatingSubtitle,
  type SubtitleCue 
} from '@lexiduo/core';
import { WhisperProcessingCard } from './WhisperProcessingCard';
import type { WhisperProgress } from '../services/whisperEngine';

const YouTubePlaybackChoiceModal = lazy(() => import('./YouTubePlaybackChoiceModal').then(m => ({ default: m.YouTubePlaybackChoiceModal })));
const YouTubeWhisperModal = lazy(() => import('./YouTubeWhisperModal').then(m => ({ default: m.YouTubeWhisperModal })));
const LocalProcessingChoiceModal = lazy(() => import('./LocalProcessingChoiceModal').then(m => ({ default: m.LocalProcessingChoiceModal })));
const WhisperModelsModal = lazy(() => import('./WhisperModelsModal').then(m => ({ default: m.WhisperModelsModal })));

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
  onStartYouTubeAudio: (mode: 'whisper' | 'gemini', key?: string) => void;

  // Local processing choice
  pendingLocalFile: File | null;
  setPendingLocalFile: (file: File | null) => void;
  isChoiceModalOpen: boolean;
  setIsChoiceModalOpen: (isOpen: boolean) => void;
  onStartLocalProcessing: (file: File, mode: 'whisper' | 'gemini', key?: string) => void;

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
  onCancelProcessing?: () => void;
  processingTierName?: string;
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
  refreshWhisperStatus: _refreshWhisperStatus,
  isYtWhisperModalOpen,
  setIsYtWhisperModalOpen,
  onStartYouTubeAudio,
  pendingLocalFile,
  setPendingLocalFile,
  isChoiceModalOpen,
  setIsChoiceModalOpen,
  onStartLocalProcessing,
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
  onCancelProcessing,
  processingTierName
}) => {
  const [isWhisperModalOpen, setIsWhisperModalOpen] = React.useState(false);
  const [isPermissionsManageOpen, setIsPermissionsManageOpen] = React.useState(false);

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
            onOpenPermissions={() => {
              setIsSettingsOpen(false);
              setIsPermissionsManageOpen(true);
            }}
          />
        )}

        {/* Subtitle Appearance & Style Modal */}
        {isSubtitleSettingsOpen && (
          <SubtitleSettingsModal
            isOpen={isSubtitleSettingsOpen}
            onClose={() => setIsSubtitleSettingsOpen(false)}
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

        {/* Permissions Management Modal (Opened from App Settings / Auto Assistant) */}
        {isPermissionsManageOpen && (
          <FloatingPermissionGuideModal 
            isOpen={isPermissionsManageOpen}
            mode="manage"
            onClose={() => setIsPermissionsManageOpen(false)}
          />
        )}

        {/* Native YouTube Floating Overlay Permission Modal */}
        {isFloatingGuideOpen && (
          <FloatingPermissionGuideModal 
            isOpen={isFloatingGuideOpen}
            mode="guide"
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
                setIsWhisperModalOpen(true);
                return;
              }
              onStartYouTubeAudio('whisper');
            }}
            onSelectCloudApi={(k) => onStartYouTubeAudio('gemini', k)}
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
                setIsWhisperModalOpen(true);
                return;
              }
              onStartLocalProcessing(f, 'whisper');
            }}
            onSelectCloudApi={(k) => {
              const f = pendingLocalFile;
              setIsChoiceModalOpen(false);
              setPendingLocalFile(null);
              onStartLocalProcessing(f, 'gemini', k);
            }}
            onClose={() => {
              setIsChoiceModalOpen(false);
              setPendingLocalFile(null);
            }}
          />
        )}

        {/* Whisper Offline Models Download & Management Modal */}
        {isWhisperModalOpen && (
          <WhisperModelsModal
            isOpen={isWhisperModalOpen}
            onClose={() => setIsWhisperModalOpen(false)}
          />
        )}
      </Suspense>

      {/* Audio Processing Indicator */}
      {isProcessing && videoId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <WhisperProcessingCard
            progress={whisperProgress}
            tierName={processingTierName || (whisperProgress?.stage ? (activeWhisperTierName || 'Whisper AI') : 'Google Gemini AI')}
            fallbackText={statusText}
            fallbackPercent={progressPercent}
            onCancel={onCancelProcessing}
          />
        </div>
      )}
    </>
  );
};
