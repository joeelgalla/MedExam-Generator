import { GoogleGenAI } from '@google/genai';

export const DEFAULT_QUESTION_MODEL = 'gemini-3.8-flash';
export const DEFAULT_FLASH_MODEL = 'gemini-3.8-flash';
export const DEFAULT_VERTEX_PROJECT = 'ai-assistant-cli-490505';
export const DEFAULT_VERTEX_LOCATION = 'global';

export function hasGeminiConfig(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.GOOGLE_VERTEX_CREDENTIALS_JSON?.trim() || env.GEMINI_API_KEY?.trim());
}

export function questionModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.GEMINI_QUESTION_MODEL?.trim() || DEFAULT_QUESTION_MODEL;
}

export function flashModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.GEMINI_FLASH_MODEL?.trim() || DEFAULT_FLASH_MODEL;
}

export function createGeminiClient(env: NodeJS.ProcessEnv = process.env): GoogleGenAI {
  const rawVertexCreds = env.GOOGLE_VERTEX_CREDENTIALS_JSON?.trim();
  if (rawVertexCreds) {
    const credentials = JSON.parse(rawVertexCreds);
    const project =
      env.GOOGLE_CLOUD_PROJECT?.trim() ||
      credentials.project_id ||
      credentials.quota_project_id ||
      DEFAULT_VERTEX_PROJECT;
    const location = env.GOOGLE_CLOUD_LOCATION?.trim() || DEFAULT_VERTEX_LOCATION;
    return new GoogleGenAI({
      vertexai: true,
      project,
      location,
      googleAuthOptions: { credentials },
    });
  }

  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Server configuration error: Gemini credentials not configured.');
  }
  return new GoogleGenAI({
    vertexai: false,
    apiKey,
  });
}
