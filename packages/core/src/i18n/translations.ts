import { tr } from './locales/tr';
import { en } from './locales/en';
import { de } from './locales/de';
import { es } from './locales/es';
import { fr } from './locales/fr';
import { it } from './locales/it';
import { pt } from './locales/pt';
import { ru } from './locales/ru';
import { zh } from './locales/zh';
import { ja } from './locales/ja';
import { ko } from './locales/ko';
import { ar } from './locales/ar';
import { hi } from './locales/hi';
import { nl } from './locales/nl';
import { pl } from './locales/pl';
import { uk } from './locales/uk';
import { sv } from './locales/sv';
import { no } from './locales/no';
import { da } from './locales/da';
import { fi } from './locales/fi';
import { el } from './locales/el';
import { cs } from './locales/cs';
import { ro } from './locales/ro';
import { hu } from './locales/hu';
import { id } from './locales/id';
import { vi } from './locales/vi';
import { th } from './locales/th';
import { he } from './locales/he';
import { fa } from './locales/fa';
import { az } from './locales/az';
import { bg } from './locales/bg';
import { sr } from './locales/sr';
import { sk } from './locales/sk';
import { hr } from './locales/hr';
import { bn } from './locales/bn';
import type { Language, TranslationKey, Translations } from './types';

export const translations: Record<Language, Record<TranslationKey, string>> = {
  tr, en, de, es, fr,
  it, pt, ru, zh, ja,
  ko, ar, hi, nl, pl,
  uk, sv, no, da, fi,
  el, cs, ro, hu, id,
  vi, th, he, fa, az,
  bg, sr, sk, hr, bn
};

export type { Language, TranslationKey, Translations };
