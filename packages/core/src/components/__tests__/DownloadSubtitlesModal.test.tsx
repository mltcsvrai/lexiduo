import ReactDOMServer from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DownloadSubtitlesModal } from '../DownloadSubtitlesModal';
import { TranslationProvider } from '../../i18n/TranslationContext';
import { useAppStore } from '../../store/useAppStore';

vi.mock('../../services/subtitleExportService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/subtitleExportService')>();
  return {
    ...actual,
    batchTranslateCues: vi.fn(async (cues, _src, targetLangs) => {
      const map = new Map();
      for (const lang of targetLangs) {
        map.set(lang, cues.map((c: any) => ({ ...c, targetText: `[${lang}] ${c.sourceText}` })));
      }
      return map;
    }),
    downloadSubtitleFile: vi.fn(),
  };
});

vi.mock('../../services/videoRemuxService', () => ({
  exportVideoWithSoftSubtitles: vi.fn(),
}));

describe('DownloadSubtitlesModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({
      videoId: 'test_vid_123',
      cues: [
        { id: '1', start: 0, end: 2, sourceText: 'Hello World', targetText: 'Merhaba Dunya' }
      ],
      sourceLang: 'en',
      targetLang: 'tr',
      detectedSourceLang: 'en'
    });
  });

  const renderModal = (isOpen: boolean = true) => {
    return ReactDOMServer.renderToString(
      <TranslationProvider initialLoaded={true}>
        <DownloadSubtitlesModal
          isOpen={isOpen}
          onClose={vi.fn()}
          videoTitle="Test Video"
        />
      </TranslationProvider>
    );
  };

  it('renders nothing when isOpen is false', () => {
    const html = renderModal(false);
    expect(html).toBe('');
  });

  it('renders modal with download types and language picker when isOpen is true', () => {
    const html = renderModal(true);
    expect(html).toContain('Test Video');
    expect(html).toContain('SRT (SubRip)');
    expect(html).toContain('VTT (WebVTT)');
  });

  it('does NOT contain the redundant subtitle content mode selector', () => {
    const html = renderModal(true);
    // Should not contain subtitleContentMode labels or options
    expect(html).not.toContain('subtitleContentMode');
    expect(html).not.toContain('subtitleModeDual');
    expect(html).not.toContain('subtitleModeSource');
    expect(html).not.toContain('subtitleModeTarget');
    expect(html).not.toContain('Altyazı İçeriği');
    expect(html).not.toContain('Çift Dilli');
    expect(html).not.toContain('Yalnızca Kaynak');
  });

  it('renders download type switcher tabs for subtitles and video', () => {
    const html = renderModal(true);
    expect(html).toContain('SRT (SubRip)');
    expect(html).toContain('VTT (WebVTT)');
  });

  it('displays search input for filtering 35+ supported languages', () => {
    const html = renderModal(true);
    expect(html).toContain('input');
    expect(html).toContain('type="text"');
  });

  it('renders language list items including supported languages', () => {
    const html = renderModal(true);
    expect(html).toContain('Turkish');
    expect(html).toContain('English');
  });
});
