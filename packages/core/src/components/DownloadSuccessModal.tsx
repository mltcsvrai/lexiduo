import React from 'react';
import { CheckCircle, FolderDown, X, FileText } from 'lucide-react';
import { useTranslation } from '../i18n/useTranslation';

export interface DownloadSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  filePath?: string;
  onDontShowAgain: () => void;
}

export const DownloadSuccessModal: React.FC<DownloadSuccessModalProps> = ({
  isOpen,
  onClose,
  fileName,
  filePath,
  onDontShowAgain,
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="download-success-title"
    >
      <div 
        className="w-full max-w-md bg-[#0B0F19] border border-white/10 rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col gap-5 text-white relative overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow ambient background effect */}
        <div className="absolute -top-16 -right-16 w-36 h-36 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3 relative">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/10 shrink-0">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 id="download-success-title" className="text-base sm:text-lg font-bold text-white tracking-tight">
                {t('downloadSuccessTitle')}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {t('downloadSuccessDesc')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition cursor-pointer shrink-0"
            aria-label={t('close')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Box: File Details & Storage Notice */}
        <div className="rounded-2xl bg-slate-900/90 border border-white/10 p-4 flex flex-col gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-slate-800 border border-white/10 flex items-center justify-center text-slate-300 shrink-0">
              <FileText size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-200 truncate" title={fileName}>
                {fileName}
              </p>
              {filePath && (
                <p className="text-[11px] text-slate-500 truncate mt-0.5" title={filePath}>
                  {filePath}
                </p>
              )}
            </div>
          </div>

          <div className="pt-2.5 border-t border-white/5 flex items-center gap-2.5 text-emerald-400">
            <FolderDown size={16} className="shrink-0 text-emerald-400" />
            <span className="text-xs font-medium text-emerald-300 tracking-wide">
              {t('downloadSavedToLexiduo')}
            </span>
          </div>
        </div>

        {/* Actions Footer */}
        <div className="flex items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={onDontShowAgain}
            className="px-3.5 py-2.5 rounded-2xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 text-xs font-medium transition cursor-pointer active:scale-95"
          >
            {t('dontShowAgain')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition cursor-pointer active:scale-95"
          >
            {t('okBtn')}
          </button>
        </div>
      </div>
    </div>
  );
};
export default DownloadSuccessModal;
