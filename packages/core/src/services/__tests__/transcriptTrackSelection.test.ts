import { describe, it, expect } from 'vitest';
import { selectCaptionTrack } from '../transcriptService';

describe('selectCaptionTrack - Intelligent YouTube Caption Selection', () => {
  const sampleTracks = [
    { languageCode: 'ar', name: { simpleText: 'Arabic' }, kind: undefined, baseUrl: 'https://youtube.com/api/timedtext?lang=ar' },
    { languageCode: 'az', name: { simpleText: 'Azerbaijani' }, kind: undefined, baseUrl: 'https://youtube.com/api/timedtext?lang=az' },
    { languageCode: 'en', name: { simpleText: 'English' }, kind: undefined, baseUrl: 'https://youtube.com/api/timedtext?lang=en' },
    { languageCode: 'en', name: { simpleText: 'English (auto-generated)' }, kind: 'asr', baseUrl: 'https://youtube.com/api/timedtext?lang=en&kind=asr' },
    { languageCode: 'es', name: { simpleText: 'Spanish' }, kind: undefined, baseUrl: 'https://youtube.com/api/timedtext?lang=es' },
  ];

  it('honors explicit user source language selection over defaults', () => {
    const renderer = {
      defaultAudioTrackIndex: 0,
      audioTracks: [{ defaultCaptionTrackIndex: 2 }],
      defaultTranslationSourceTrackIndices: [2]
    };

    const selected = selectCaptionTrack(sampleTracks, renderer, 'es');
    expect(selected).toBeDefined();
    expect(selected.languageCode).toBe('es');
  });

  it('selects YouTube defaultCaptionTrackIndex over alphabetical first (fixes Arabic bug for English videos)', () => {
    // Steve Jobs / Kurzgesagt / Tim Urban scenario
    const renderer = {
      defaultAudioTrackIndex: 0,
      audioTracks: [{
        captionTrackIndices: [0, 1, 2, 4, 3],
        defaultCaptionTrackIndex: 2, // Points to English
        hasDefaultTrack: true
      }],
      defaultTranslationSourceTrackIndices: [2]
    };

    const selected = selectCaptionTrack(sampleTracks, renderer, 'auto');
    expect(selected).toBeDefined();
    expect(selected.languageCode).toBe('en');
    expect(selected.kind).toBeUndefined(); // Prefers manual English
  });

  it('falls back to defaultTranslationSourceTrackIndices if defaultCaptionTrackIndex is not available', () => {
    const renderer = {
      defaultAudioTrackIndex: 0,
      audioTracks: [{}],
      defaultTranslationSourceTrackIndices: [2] // Points to English
    };

    const selected = selectCaptionTrack(sampleTracks, renderer, 'auto');
    expect(selected).toBeDefined();
    expect(selected.languageCode).toBe('en');
  });

  it('selects matching manual or ASR track when audioTrackId is provided', () => {
    const tracksWithJa = [
      { languageCode: 'ar', name: { simpleText: 'Arabic' }, kind: undefined, baseUrl: 'https://.../ar' },
      { languageCode: 'ja', name: { simpleText: 'Japanese' }, kind: undefined, baseUrl: 'https://.../ja' },
    ];
    const renderer = {
      defaultAudioTrackIndex: 0,
      audioTracks: [{
        audioTrackId: 'ja.orig'
      }]
    };

    const selected = selectCaptionTrack(tracksWithJa, renderer, 'auto');
    expect(selected).toBeDefined();
    expect(selected.languageCode).toBe('ja');
  });

  it('deduces original speech language from ASR track when audio metadata is missing', () => {
    // If YouTube only gives an ASR track in English, but manual subtitles in Arabic & Spanish
    const tracksWithOnlyAsrNative = [
      { languageCode: 'ar', name: { simpleText: 'Arabic' }, kind: undefined, baseUrl: 'https://.../ar' },
      { languageCode: 'en', name: { simpleText: 'English' }, kind: 'asr', baseUrl: 'https://.../en-asr' },
      { languageCode: 'es', name: { simpleText: 'Spanish' }, kind: undefined, baseUrl: 'https://.../es' },
    ];
    const renderer = {}; // No default indices

    const selected = selectCaptionTrack(tracksWithOnlyAsrNative, renderer, 'auto');
    expect(selected).toBeDefined();
    expect(selected.languageCode).toBe('en');
    expect(selected.kind).toBe('asr');
  });

  it('prefers creator manual subtitle matching ASR language over ASR itself', () => {
    const tracksWithBoth = [
      { languageCode: 'ar', name: { simpleText: 'Arabic' }, kind: undefined, baseUrl: 'https://.../ar' },
      { languageCode: 'en', name: { simpleText: 'English' }, kind: undefined, baseUrl: 'https://.../en-manual' },
      { languageCode: 'en', name: { simpleText: 'English (auto)' }, kind: 'asr', baseUrl: 'https://.../en-asr' },
    ];
    const renderer = {}; // No audioTrack metadata

    const selected = selectCaptionTrack(tracksWithBoth, renderer, 'auto');
    expect(selected).toBeDefined();
    expect(selected.languageCode).toBe('en');
    expect(selected.kind).toBeUndefined(); // Selected creator manual English, not ASR!
  });

  it('gracefully falls back to first creator manual track when no metadata or ASR exists', () => {
    const rawManualTracks = [
      { languageCode: 'de', name: { simpleText: 'German' }, kind: undefined, baseUrl: 'https://.../de' },
      { languageCode: 'fr', name: { simpleText: 'French' }, kind: undefined, baseUrl: 'https://.../fr' },
    ];
    const renderer = {};

    const selected = selectCaptionTrack(rawManualTracks, renderer, 'auto');
    expect(selected).toBeDefined();
    expect(selected.languageCode).toBe('de');
  });

  it('returns null for empty captionTracks array', () => {
    const selected = selectCaptionTrack([], {}, 'auto');
    expect(selected).toBeNull();
  });
});
