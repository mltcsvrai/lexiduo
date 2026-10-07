import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { FloatingDock } from '../FloatingDock';
import { TranslationProvider } from '../../i18n/TranslationContext';

describe('FloatingDock Component', () => {
  const renderDock = (props: React.ComponentProps<typeof FloatingDock>) => {
    return ReactDOMServer.renderToString(
      <TranslationProvider>
        <FloatingDock {...props} />
      </TranslationProvider>
    );
  };

  it('renders dock with default settings (download button visible by default)', () => {
    const html = renderDock({
      onSearchToggle: vi.fn(),
      onSettingsOpen: vi.fn(),
    });

    expect(html).toContain('CC');
    expect(html).toContain('text-amber-400'); // Download button icon color
  });

  it('hides download button when showDownload is false (e.g. no active video on home screen)', () => {
    const html = renderDock({
      onSearchToggle: vi.fn(),
      onSettingsOpen: vi.fn(),
      showDownload: false,
    });

    expect(html).toContain('CC');
    expect(html).not.toContain('text-amber-400'); // Download button should NOT be rendered
  });

  it('shows home button when showHome is true and hides when false', () => {
    const htmlWithoutHome = renderDock({
      onSearchToggle: vi.fn(),
      onSettingsOpen: vi.fn(),
      showHome: false,
    });
    expect(htmlWithoutHome).not.toContain('text-red-400');

    const htmlWithHome = renderDock({
      onSearchToggle: vi.fn(),
      onSettingsOpen: vi.fn(),
      showHome: true,
      onHomeClick: vi.fn(),
    });
    expect(htmlWithHome).toContain('text-red-400');
  });

  it('shows floating button when onFloatingClick callback is provided', () => {
    const html = renderDock({
      onSearchToggle: vi.fn(),
      onSettingsOpen: vi.fn(),
      onFloatingClick: vi.fn(),
    });
    expect(html).toContain('text-emerald-400');
  });
});
