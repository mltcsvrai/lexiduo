import React from 'react';
import { Cpu, Flame, Languages, CheckCircle2, Clock, Zap, Waves } from 'lucide-react';
import { useTranslation } from '@lexiduo/core';
import type { WhisperProgress, WhisperStage } from '../services/whisperEngine';

interface WhisperProcessingCardProps {
  progress?: WhisperProgress | null;
  tierName?: string;
  fallbackText?: string;
  fallbackPercent?: number;
}

function formatDuration(seconds?: number): string {
  if (seconds == null || isNaN(seconds) || seconds < 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export const WhisperProcessingCard: React.FC<WhisperProcessingCardProps> = ({
  progress,
  tierName = 'Whisper AI',
  fallbackText,
  fallbackPercent = 0
}) => {
  const { t, language } = useTranslation();

  const stage: WhisperStage = progress?.stage || 'transcribing';
  const percent = progress?.percent ?? progress?.progress ?? fallbackPercent;
  const detail = progress?.detail || fallbackText || t('stageTranscribing');
  const processedSec = progress?.processedSeconds;
  const totalSec = progress?.totalSeconds;
  const etaSec = progress?.etaSeconds;
  const speed = progress?.speedFactor;
  const currentChunk = progress?.currentChunk;
  const totalChunks = progress?.totalChunks;

  // Render animated icon per stage
  const renderStageIcon = () => {
    switch (stage) {
      case 'extracting':
        return <Waves className="w-7 h-7 text-cyan-400 animate-pulse" />;
      case 'warming_up':
        return <Flame className="w-7 h-7 text-amber-400 animate-bounce" />;
      case 'segmenting':
      case 'translating':
        return <Languages className="w-7 h-7 text-purple-400 animate-pulse" />;
      case 'ready':
        return <CheckCircle2 className="w-7 h-7 text-emerald-400" />;
      case 'transcribing':
      default:
        return <Cpu className="w-7 h-7 text-indigo-400 animate-spin" />;
    }
  };

  // Stage name text
  const getStageTitle = () => {
    switch (stage) {
      case 'extracting':
        return t('stageExtracting');
      case 'warming_up':
        return t('stageWarmingUp');
      case 'segmenting':
        return t('stageSegmenting');
      case 'translating':
        return t('stageTranslating');
      case 'ready':
        return t('stageReady');
      case 'transcribing':
      default:
        return t('stageTranscribing');
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto flex flex-col items-center justify-center p-6 sm:p-7 rounded-3xl bg-slate-900/90 border border-indigo-500/30 shadow-2xl backdrop-blur-2xl animate-in fade-in duration-300">
      {/* Icon Badge */}
      <div className="w-16 h-16 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/10">
        {renderStageIcon()}
      </div>

      {/* Stage Badge & Model Name */}
      <div className="flex items-center gap-2 mb-2 flex-wrap justify-center">
        <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
          {tierName}
        </span>
        <span className="text-xs font-semibold text-slate-300">
          {getStageTitle()}
        </span>
      </div>

      {/* Main Status Detail */}
      <p className="text-sm sm:text-base font-semibold text-white mb-4 line-clamp-1 max-w-md text-center">
        {detail}
      </p>

      {/* Progress Bar Container */}
      <div className="w-full space-y-2 mb-3">
        <div className="w-full h-3 bg-slate-800/80 rounded-full overflow-hidden p-0.5 border border-white/10 shadow-inner">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400 rounded-full transition-all duration-300 shadow-md"
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </div>

        {/* Real Percentage and Time Stats */}
        <div className="flex items-center justify-between text-xs px-1">
          <span className="font-mono font-bold text-indigo-300">
            {language === 'tr' ? `%${percent}` : `${percent}%`}
          </span>

          {totalSec != null && totalSec > 0 && (
            <span className="text-slate-400 font-mono text-[11px]">
              <span className="text-slate-200">{formatDuration(processedSec)}</span> / {formatDuration(totalSec)}
            </span>
          )}
        </div>
      </div>

      {/* Metadata Capsule (ETA, Speed, Chunk) */}
      <div className="w-full flex items-center justify-between gap-2 pt-3 border-t border-white/10 text-[11px] text-slate-300 flex-wrap">
        {/* Estimated Time Remaining (ETA) */}
        <div className="flex items-center gap-1.5 font-medium">
          <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          {etaSec != null && etaSec > 0 ? (
            <span>
              <span className="text-slate-400">{t('estimatedTimeRemaining')}:</span>{' '}
              <strong className="text-amber-300 font-mono">
                {etaSec >= 60 ? `~${Math.ceil(etaSec / 60)} ${t('minuteShort')}` : `~${etaSec} ${t('secondShort')}`}
              </strong>
            </span>
          ) : percent >= 98 ? (
            <span className="text-slate-400">{t('stageReady')}</span>
          ) : (
            <span className="text-slate-400">
              <span className="text-slate-500">{t('estimatedTimeRemaining')}:</span>{' '}
              <span className="text-slate-300 animate-pulse">{t('calculatingEta')}</span>
            </span>
          )}
        </div>

        {/* Speed Factor / Chunks */}
        <div className="flex items-center gap-2">
          {speed != null && speed > 0 && (
            <span className="inline-flex items-center gap-1 text-cyan-300 font-mono text-[10px] bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/20">
              <Zap className="w-3 h-3 text-cyan-400" />
              <span>{speed.toFixed(1)}x {t('processingSpeed')}</span>
            </span>
          )}

          {currentChunk != null && totalChunks != null && totalChunks > 1 && (
            <span className="text-[10px] font-mono text-slate-400 bg-white/5 px-2 py-0.5 rounded-md">
              {currentChunk}/{totalChunks}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
