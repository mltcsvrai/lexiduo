import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testGeminiApiKey } from '../geminiService';
import * as translationService from '../translationService';

describe('testGeminiApiKey', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should reject short or empty api keys immediately without network call', async () => {
    const fetchSpy = vi.spyOn(translationService, 'smartFetch');
    
    const r1 = await testGeminiApiKey('');
    expect(r1.success).toBe(false);
    expect(r1.status).toBe('invalid');

    const r2 = await testGeminiApiKey('   ');
    expect(r2.success).toBe(false);
    expect(r2.status).toBe('invalid');

    const r3 = await testGeminiApiKey('1234');
    expect(r3.success).toBe(false);
    expect(r3.status).toBe('invalid');

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should return valid when Google AI Studio returns HTTP 200', async () => {
    vi.spyOn(translationService, 'smartFetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ models: [{ name: 'models/gemma-4-31b-it' }] }),
      json: async () => ({ models: [{ name: 'models/gemma-4-31b-it' }] }),
      arrayBuffer: async () => new ArrayBuffer(0)
    });

    const result = await testGeminiApiKey('AIzaSyValidKey1234567890');
    expect(result.success).toBe(true);
    expect(result.status).toBe('valid');
    expect(result.statusCode).toBe(200);
  });

  it('should return invalid when Google AI Studio returns HTTP 400 or 403', async () => {
    vi.spyOn(translationService, 'smartFetch').mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: { message: 'API_KEY_INVALID' } }),
      json: async () => ({ error: { message: 'API_KEY_INVALID' } }),
      arrayBuffer: async () => new ArrayBuffer(0)
    });

    const result = await testGeminiApiKey('AIzaSyInvalidKey1234567890');
    expect(result.success).toBe(false);
    expect(result.status).toBe('invalid');
    expect(result.statusCode).toBe(400);
  });

  it('should return rate_limited when Google AI Studio returns HTTP 429', async () => {
    vi.spyOn(translationService, 'smartFetch').mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => JSON.stringify({ error: { message: 'RESOURCE_EXHAUSTED' } }),
      json: async () => ({ error: { message: 'RESOURCE_EXHAUSTED' } }),
      arrayBuffer: async () => new ArrayBuffer(0)
    });

    const result = await testGeminiApiKey('AIzaSyQuotaKey1234567890');
    expect(result.success).toBe(false);
    expect(result.status).toBe('rate_limited');
    expect(result.statusCode).toBe(429);
  });

  it('should return network_error when fetch throws network error or timeout', async () => {
    vi.spyOn(translationService, 'smartFetch').mockRejectedValueOnce(new Error('Network connection timeout'));

    const result = await testGeminiApiKey('AIzaSyValidKey1234567890');
    expect(result.success).toBe(false);
    expect(result.status).toBe('network_error');
    expect(result.message).toContain('timeout');
  });
});
