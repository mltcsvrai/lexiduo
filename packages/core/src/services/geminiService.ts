import { smartFetch } from './translationService';

export const GEMINI_MODEL_HIERARCHY = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.5-flash-lite'
] as const;

export type ApiKeyStatus = 'idle' | 'testing' | 'valid' | 'invalid' | 'rate_limited' | 'network_error';

export interface ApiKeyTestResult {
  success: boolean;
  status: ApiKeyStatus;
  message?: string;
  statusCode?: number;
}

/**
 * Tests Google AI Studio API key validity using the official metadata model list endpoint.
 * This endpoint verifies authorization and active quota without generating content or consuming tokens.
 */
export async function testGeminiApiKey(apiKey: string): Promise<ApiKeyTestResult> {
  const cleanKey = apiKey ? apiKey.trim() : '';
  if (!cleanKey || cleanKey.length < 8) {
    return {
      success: false,
      status: 'invalid',
      message: 'API key is too short or empty'
    };
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`;
    const res = await smartFetch(url, undefined, 7000);

    if (res.ok) {
      return {
        success: true,
        status: 'valid',
        statusCode: res.status
      };
    }

    if (res.status === 400 || res.status === 403) {
      return {
        success: false,
        status: 'invalid',
        statusCode: res.status
      };
    }

    if (res.status === 429) {
      return {
        success: false,
        status: 'rate_limited',
        statusCode: res.status
      };
    }

    return {
      success: false,
      status: 'network_error',
      statusCode: res.status
    };
  } catch (err: any) {
    return {
      success: false,
      status: 'network_error',
      message: err?.message || 'Connection timeout or network failure'
    };
  }
}
