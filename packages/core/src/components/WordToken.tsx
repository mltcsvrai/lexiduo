import React from 'react';

interface WordTokenProps {
  token: string;
  isTargetWord: boolean;
  tokenId: string;
  isKaraokeActive?: boolean;
  isKaraokePast?: boolean;
  karaokeEnabled?: boolean;
}

export const WordToken: React.FC<WordTokenProps> = ({
  token,
  isTargetWord,
  tokenId,
  isKaraokeActive = false,
  isKaraokePast = false,
  karaokeEnabled = false,
}) => {
  const handleWordClick = (e: React.MouseEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    const cleanWord = token.replace(/[.,!?()[\]{}"':;]/g, '');
    if (cleanWord.trim()) {
      const payload = { word: cleanWord, isTargetWord, tokenId };
      window.dispatchEvent(new CustomEvent('lexiduo-word-lookup', { detail: payload }));
    }
  };

  const karaokeClasses = karaokeEnabled
    ? isKaraokeActive
      ? 'text-yellow-300 font-black drop-shadow-[0_0_12px_rgba(250,204,21,0.95)] underline decoration-yellow-400 decoration-2 bg-yellow-400/20 ring-1 ring-yellow-400/30'
      : isKaraokePast
        ? 'opacity-95 font-medium'
        : 'opacity-60'
    : '';

  return (
    <span
      onClick={handleWordClick}
      className={`inline-block cursor-pointer hover:text-yellow-300 hover:scale-[1.12] active:scale-95 transition-all duration-150 drop-shadow-md px-1 sm:px-[2px] py-0.5 sm:py-0 rounded pointer-events-auto ${karaokeClasses}`}
    >
      {token}
    </span>
  );
};
