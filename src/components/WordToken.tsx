import React from 'react';
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/react';
import { WordTooltip } from './WordTooltip';
import { useAppStore } from '../store/useAppStore';

interface WordTokenProps {
  token: string;
  isTargetWord: boolean;
  tokenId: string;
}

export const WordToken: React.FC<WordTokenProps> = ({ token, isTargetWord, tokenId }) => {
  const activeTokenId = useAppStore(s => s.activeTokenId);
  const activeWordTranslation = useAppStore(s => s.activeWordTranslation);
  const wordLoading = useAppStore(s => s.wordLoading);
  const setActiveTokenId = useAppStore(s => s.setActiveTokenId);
  const setActiveWordTranslation = useAppStore(s => s.setActiveWordTranslation);

  const isActive = activeTokenId === tokenId;

  const { refs, floatingStyles } = useFloating({
    open: isActive,
    placement: 'top',
    middleware: [offset(10), flip(), shift({ padding: 10 })],
    whileElementsMounted: autoUpdate,
  });

  const handleWordClick = (e: React.MouseEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    const cleanWord = token.replace(/[.,!?()[\]{}"':;]/g, "");
    if (cleanWord.trim()) {
      const event = new CustomEvent('yt-ceviri-word-lookup', { 
        detail: { word: cleanWord, isTargetWord, tokenId } 
      });
      window.dispatchEvent(event);
    }
  };

  const handleClose = () => {
    setActiveTokenId(null);
    setActiveWordTranslation(null);
  };

  return (
    <>
      <span
        ref={refs.setReference}
        onClick={handleWordClick}
        className="inline-block cursor-pointer hover:text-yellow-300 hover:scale-[1.12] active:scale-95 transition-transform drop-shadow-md px-1 sm:px-[2px] py-0.5 sm:py-0 rounded pointer-events-auto"
      >
        {token}
      </span>
      {isActive && (
        <div className="hidden lg:block">
          <WordTooltip
            ref={refs.setFloating}
            style={floatingStyles}
            translation={activeWordTranslation}
            loading={wordLoading}
            onClose={handleClose}
            isTurkish={isTargetWord}
          />
        </div>
      )}
    </>
  );
};
