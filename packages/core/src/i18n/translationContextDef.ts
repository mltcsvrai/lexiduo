import { createContext } from 'react';
import type { Language, TranslationKey } from './translations';

export interface TranslationContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export const TranslationContext = createContext<TranslationContextType | undefined>(undefined);
