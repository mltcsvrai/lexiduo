import { describe, it, expect } from 'vitest';
import { extractTextFromIntentPayload } from '../sendIntentService';

describe('sendIntentService', () => {
  it('extracts URL directly from payload url field', () => {
    const text = extractTextFromIntentPayload({
      url: 'https://youtu.be/0VBIICYDjPo?si=123'
    });
    expect(text).toBe('https://youtu.be/0VBIICYDjPo?si=123');
  });

  it('extracts text from payload title when url is missing', () => {
    const text = extractTextFromIntentPayload({
      title: 'Amazing Tech Video https://youtu.be/0VBIICYDjPo'
    });
    expect(text).toBe('Amazing Tech Video https://youtu.be/0VBIICYDjPo');
  });

  it('extracts text from extras.android.intent.extra.TEXT if top-level fields are missing', () => {
    const text = extractTextFromIntentPayload({
      extras: {
        'android.intent.extra.TEXT': 'https://www.youtube.com/watch?v=0VBIICYDjPo'
      }
    });
    expect(text).toBe('https://www.youtube.com/watch?v=0VBIICYDjPo');
  });

  it('returns null when payload is empty or invalid', () => {
    expect(extractTextFromIntentPayload(null)).toBeNull();
    expect(extractTextFromIntentPayload({})).toBeNull();
    expect(extractTextFromIntentPayload({ url: '   ' })).toBeNull();
  });
});
