import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations, type Language, type TranslationKey } from './translations';
import { SUPPORTED_LANGUAGES, LANGUAGE_MAP } from './languages';
import { get, set } from 'idb-keyval';
import { useAppStore } from '../store/useAppStore';

interface TranslationContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export const TranslationContext = createContext<TranslationContextType | undefined>(undefined);

export const TranslationProvider: React.FC<{ children: React.ReactNode; initialLoaded?: boolean }> = ({ children, initialLoaded }) => {
  const [language, setLanguageState] = useState<Language>('en');
  const [isLoaded, setIsLoaded] = useState(initialLoaded ?? typeof window === 'undefined');

  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const storedLang = await get('app_language');
        const storedTargetLang = await get('target_lang');
        if (storedLang && SUPPORTED_LANGUAGES.some(l => l.code === storedLang)) {
          const selected = storedLang as Language;
          setLanguageState(selected);
          document.documentElement.dir = LANGUAGE_MAP[selected]?.dir || 'ltr';
        } else {
          setLanguageState('en');
          document.documentElement.dir = 'ltr';
        }

        // Restore target language if previously chosen by user; otherwise remain unselected ('')
        if (storedTargetLang && SUPPORTED_LANGUAGES.some(l => l.code === storedTargetLang)) {
          useAppStore.getState().setTargetLang(storedTargetLang as string);
        }
      } catch (err) {
        console.error('Error loading language', err);
      } finally {
        setIsLoaded(true);
      }
    };
    loadLanguage();
  }, []);

  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
    document.documentElement.dir = LANGUAGE_MAP[lang]?.dir || 'ltr';
    try {
      await set('app_language', lang);
    } catch (err) {
      console.error('Error saving language', err);
    }
  };

  const t = (key: TranslationKey, params?: Record<string, string | number>): string => {
    let str = translations[language]?.[key] || translations['en']?.[key] || key;
    if (params) {
      for (const [paramKey, val] of Object.entries(params)) {
        str = str.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(val));
      }
    }
    return str;
  };

  if (!isLoaded) return null; // Avoid render flash

  return (
    <TranslationContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </TranslationContext.Provider>
  );
};

export { useTranslation } from './useTranslation';
