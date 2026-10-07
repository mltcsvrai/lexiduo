import { describe, it, expect } from 'vitest';
import { getLanguageDisplayName, SUPPORTED_LANGUAGES } from '../languages';
import { translations } from '../translations';
import type { Language } from '../types';

describe('Dynamic Language Display and Localization', () => {
  it('correctly resolves language display names based on current UI language', () => {
    // Turkish UI
    expect(getLanguageDisplayName('de', 'tr')).toBe('Almanca');
    expect(getLanguageDisplayName('en', 'tr')).toBe('İngilizce');
    expect(getLanguageDisplayName('es', 'tr')).toBe('İspanyolca');

    // English UI
    expect(getLanguageDisplayName('de', 'en')).toBe('German');
    expect(getLanguageDisplayName('tr', 'en')).toBe('Turkish');
    expect(getLanguageDisplayName('fr', 'en')).toBe('French');

    // German UI
    expect(getLanguageDisplayName('de', 'de')).toBe('Deutsch');
  });

  it('handles dialects and auto-prefixes gracefully in getLanguageDisplayName', () => {
    expect(getLanguageDisplayName('a.de', 'tr')).toBe('Almanca');
    expect(getLanguageDisplayName('de-DE', 'en')).toBe('German');
  });

  it('falls back to language info or code when given unknown language code', () => {
    expect(getLanguageDisplayName('xyz', 'tr')).toBe('xyz');
  });

  it('ensures all 35 supported locales have preparingTargetTranslation defined with {lang} token', () => {
    for (const langInfo of SUPPORTED_LANGUAGES) {
      const code = langInfo.code as Language;
      const localeObj = translations[code];
      expect(localeObj, `Locale ${code} should exist in translations`).toBeDefined();
      expect(
        localeObj.preparingTargetTranslation,
        `Locale ${code} must define preparingTargetTranslation`
      ).toBeDefined();
      expect(
        localeObj.preparingTargetTranslation,
        `Locale ${code} preparingTargetTranslation must include {lang} token`
      ).toContain('{lang}');
    }
  });

  it('interpolates {lang} token properly into template strings', () => {
    const trTemplate = translations['tr'].preparingTargetTranslation;
    const interpolatedTr = trTemplate.replace('{lang}', 'Almanca');
    expect(interpolatedTr).toBe('Almanca çevirisi hazırlanıyor...');

    const enTemplate = translations['en'].preparingTargetTranslation;
    const interpolatedEn = enTemplate.replace('{lang}', 'German');
    expect(interpolatedEn).toBe('Preparing German translation...');

    const deTemplate = translations['de'].preparingTargetTranslation;
    const interpolatedDe = deTemplate.replace('{lang}', 'Deutsch');
    expect(interpolatedDe).toBe('Deutsch-Übersetzung wird vorbereitet...');
  });

  it('ensures all 35 locales have calculatingEta, largeModelMobileNotice, largeModelNotSupportedOnMobile, and speedFactorLabel defined', () => {
    for (const langInfo of SUPPORTED_LANGUAGES) {
      const code = langInfo.code as Language;
      const localeObj = translations[code];
      expect(localeObj.calculatingEta, `${code} missing calculatingEta`).toBeTruthy();
      expect(localeObj.largeModelMobileNotice, `${code} missing largeModelMobileNotice`).toBeTruthy();
      expect(localeObj.largeModelNotSupportedOnMobile, `${code} missing largeModelNotSupportedOnMobile`).toBeTruthy();
      expect(localeObj.speedFactorLabel, `${code} missing speedFactorLabel`).toBeTruthy();
    }
  });
});
