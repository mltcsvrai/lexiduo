import { describe, it, expect } from 'vitest';
import { extractYouTubeId } from '../transcriptService';

describe('extractYouTubeId', () => {
  it('handles direct 11-char video ID', () => {
    expect(extractYouTubeId('0VBIICYDjPo')).toBe('0VBIICYDjPo');
    expect(extractYouTubeId('  UF8uR6Z6KLc  ')).toBe('UF8uR6Z6KLc');
  });

  it('extracts ID from standard watch URL', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=0VBIICYDjPo')).toBe('0VBIICYDjPo');
    expect(extractYouTubeId('http://youtube.com/watch?v=0VBIICYDjPo')).toBe('0VBIICYDjPo');
  });

  it('extracts ID from watch URL with extra parameters', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?feature=shared&v=0VBIICYDjPo&t=45s')).toBe('0VBIICYDjPo');
  });

  it('extracts ID from youtu.be shortlink', () => {
    expect(extractYouTubeId('https://youtu.be/0VBIICYDjPo?si=d2m-90a')).toBe('0VBIICYDjPo');
    expect(extractYouTubeId('http://youtu.be/0VBIICYDjPo')).toBe('0VBIICYDjPo');
  });

  it('extracts ID from YouTube Shorts', () => {
    expect(extractYouTubeId('https://youtube.com/shorts/0VBIICYDjPo?feature=share')).toBe('0VBIICYDjPo');
    expect(extractYouTubeId('https://www.youtube.com/shorts/0VBIICYDjPo')).toBe('0VBIICYDjPo');
  });

  it('extracts ID from YouTube Live streams', () => {
    expect(extractYouTubeId('https://www.youtube.com/live/0VBIICYDjPo?si=abc')).toBe('0VBIICYDjPo');
    expect(extractYouTubeId('https://youtube.com/live/0VBIICYDjPo')).toBe('0VBIICYDjPo');
  });

  it('extracts ID from mobile and music subdomains', () => {
    expect(extractYouTubeId('https://m.youtube.com/watch?v=0VBIICYDjPo')).toBe('0VBIICYDjPo');
    expect(extractYouTubeId('https://music.youtube.com/watch?v=0VBIICYDjPo')).toBe('0VBIICYDjPo');
  });

  it('extracts ID when embedded inside a share sentence/text', () => {
    const shareText = 'Check out this awesome video: https://youtu.be/0VBIICYDjPo?si=test from YouTube';
    expect(extractYouTubeId(shareText)).toBe('0VBIICYDjPo');
  });

  it('returns empty string for non-YouTube text and sentences', () => {
    expect(extractYouTubeId('This is just a random text without youtube link')).toBe('');
    expect(extractYouTubeId('')).toBe('');
    expect(extractYouTubeId('https://example.com/not-youtube')).toBe('');
  });
});
