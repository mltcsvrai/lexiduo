import type { Language, LanguageInfo } from './types';

export const SUPPORTED_LANGUAGES: LanguageInfo[] = [
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', bcp47: 'tr-TR', dir: 'ltr' },
  { code: 'en', name: 'English', nativeName: 'English', bcp47: 'en-US', dir: 'ltr' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', bcp47: 'de-DE', dir: 'ltr' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', bcp47: 'es-ES', dir: 'ltr' },
  { code: 'fr', name: 'French', nativeName: 'Français', bcp47: 'fr-FR', dir: 'ltr' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', bcp47: 'it-IT', dir: 'ltr' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', bcp47: 'pt-PT', dir: 'ltr' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', bcp47: 'ru-RU', dir: 'ltr' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', bcp47: 'zh-CN', dir: 'ltr' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', bcp47: 'ja-JP', dir: 'ltr' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', bcp47: 'ko-KR', dir: 'ltr' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', bcp47: 'ar-SA', dir: 'rtl' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', bcp47: 'hi-IN', dir: 'ltr' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', bcp47: 'nl-NL', dir: 'ltr' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', bcp47: 'pl-PL', dir: 'ltr' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', bcp47: 'uk-UA', dir: 'ltr' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska', bcp47: 'sv-SE', dir: 'ltr' },
  { code: 'no', name: 'Norwegian', nativeName: 'Norsk', bcp47: 'no-NO', dir: 'ltr' },
  { code: 'da', name: 'Danish', nativeName: 'Dansk', bcp47: 'da-DK', dir: 'ltr' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi', bcp47: 'fi-FI', dir: 'ltr' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', bcp47: 'el-GR', dir: 'ltr' },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština', bcp47: 'cs-CZ', dir: 'ltr' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română', bcp47: 'ro-RO', dir: 'ltr' },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar', bcp47: 'hu-HU', dir: 'ltr' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', bcp47: 'id-ID', dir: 'ltr' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', bcp47: 'vi-VN', dir: 'ltr' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', bcp47: 'th-TH', dir: 'ltr' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', bcp47: 'he-IL', dir: 'rtl' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی', bcp47: 'fa-IR', dir: 'rtl' },
  { code: 'az', name: 'Azerbaijani', nativeName: 'Azərbaycanca', bcp47: 'az-AZ', dir: 'ltr' },
  { code: 'bg', name: 'Bulgarian', nativeName: 'Български', bcp47: 'bg-BG', dir: 'ltr' },
  { code: 'sr', name: 'Serbian', nativeName: 'Српски', bcp47: 'sr-RS', dir: 'ltr' },
  { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina', bcp47: 'sk-SK', dir: 'ltr' },
  { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski', bcp47: 'hr-HR', dir: 'ltr' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', bcp47: 'bn-BD', dir: 'ltr' }
];

export const LANGUAGE_MAP: Record<Language, LanguageInfo> = SUPPORTED_LANGUAGES.reduce((acc, lang) => {
  acc[lang.code] = lang;
  return acc;
}, {} as Record<Language, LanguageInfo>);

export const BCP47_MAP: Record<string, string> = SUPPORTED_LANGUAGES.reduce((acc, lang) => {
  acc[lang.code] = lang.bcp47;
  return acc;
}, {} as Record<string, string>);

export function getLanguageBcp47(code: string): string {
  return BCP47_MAP[code] || 'en-US';
}
