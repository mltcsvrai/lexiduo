import type { WordTranslation } from '../types';
import { translateTextSecure } from './translationService';


export async function lookupWord(
  word: string, 
  sourceLang: string = 'en', 
  targetLang: string = 'tr', 
  isTargetWord?: boolean, 
  _apiKey?: string,
  detectedSourceLang?: string
): Promise<WordTranslation> {
  const cleanWord = word.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  
  // Resolve true effective source language (never leave as 'auto' for target language 'tl')
  const fallbackSource = targetLang === 'tr' ? 'en' : 'tr';
  const effectiveSource = (sourceLang && sourceLang !== 'auto') 
    ? sourceLang 
    : (detectedSourceLang || fallbackSource);

  const sl = isTargetWord ? targetLang : (sourceLang === 'auto' ? 'auto' : effectiveSource);
  const tl = isTargetWord ? effectiveSource : targetLang;
  const tgtCode = tl.toUpperCase();
  const posTag = tgtCode;

  if (!cleanWord) {
    return {
      word,
      normalizedWord: word.toLowerCase(),
      translation: cleanWord,
      partOfSpeech: posTag,
      isTargetWord
    };
  }

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
    partOfSpeech: posTag,
    isTargetWord
  };
}
