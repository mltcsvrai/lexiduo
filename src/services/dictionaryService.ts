import type { WordTranslation } from '../types';
import { translateTextSecure } from './transcriptService';

export async function lookupWord(word: string, sourceLang: string = 'en', targetLang: string = 'tr', isTargetWord?: boolean, _apiKey?: string): Promise<WordTranslation> {
  const cleanWord = word.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  if (!cleanWord) {
    const srcCode = (sourceLang === 'auto' ? 'SRC' : sourceLang.toUpperCase());
    const tgtCode = targetLang.toUpperCase();
    const posTag = isTargetWord ? tgtCode : srcCode;

    return {
      word,
      normalizedWord: word.toLowerCase(),
      translation: cleanWord,
      partOfSpeech: posTag,
      isTargetWord
    };
  }

  const sl = isTargetWord ? targetLang : sourceLang;
  const tl = isTargetWord ? sourceLang : targetLang;
  const srcCode = (sl === 'auto' ? 'SRC' : sl.toUpperCase());
  const tgtCode = tl.toUpperCase();
  const posTag = tgtCode;

  try {
    const translated = await translateTextSecure(cleanWord, sl, tl);
    if (translated && translated.toLowerCase() !== cleanWord.toLowerCase()) {
      return {
        word,
        normalizedWord: cleanWord,
        translation: translated,
        partOfSpeech: posTag,
        isTargetWord
      };
    }
  } catch (err) {
    console.warn('Word lookup error:', err);
  }

  return {
    word: cleanWord,
    normalizedWord: cleanWord.toLowerCase(),
    translation: cleanWord,
    partOfSpeech: srcCode,
    isTargetWord
  };
}
