// Klient API panelu administratora. Działa tylko z tej samej domeny co serwer
// (ciasteczko sesji + nagłówek, którego obca strona nie może wysłać).
import { API_BASE } from '../data/api.ts';

export class AdminError extends Error {
  readonly status: number;
  readonly errors: string[];
  constructor(status: number, message: string, errors: string[] = []) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/admin${path}`, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        'X-MultiLingua-Admin': '1',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new AdminError(0, 'Brak połączenia z serwerem.');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; errors?: string[] };
  if (!res.ok) throw new AdminError(res.status, data.error ?? `Błąd ${res.status}`, data.errors);
  return data as T;
}

export const adminApi = {
  get: <T>(path: string) => call<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => call<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => call<T>('PUT', path, body),
  del: <T>(path: string, body: unknown) => call<T>('DELETE', path, body),
};

export interface Status {
  configured: boolean;
  loggedIn: boolean;
  seed: { hash: string; edited?: boolean; pending?: string } | null;
}

export interface UnitInfo {
  file: string;
  id?: string;
  title?: string;
  subtitle?: string;
  cefr?: string;
  icon?: string;
  counts?: { vocab: number; sentences: number; grammar: number; stories: number };
  error?: string;
}

export interface CourseInfo {
  id: string;
  title: string;
  units: UnitInfo[];
}

export interface Validation {
  ok: boolean;
  errors: string[];
  /** Pytania, przykłady i zdania wychodzące poza pokazany materiał (zapis jest możliwy, ale warto poprawić). */
  coverage?: string[];
  warnings: string[];
  stats: { units: number; lessons: number; words: number; sentences: number; grammar: number; stories: number; images: number } | null;
}

export interface Generated extends Validation {
  file: string;
  text: string;
  model: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
}

export interface ModelInfo {
  id: string;
  name: string;
  context: number;
  promptPrice: number;
  completionPrice: number;
}

export interface AiSettings {
  model: string;
  hasKey: boolean;
  keyFromEnv: boolean;
  keyHint: string;
}

export interface ImageWord {
  id: string;
  unit: string;
  unitTitle: string;
  t: string;
  n: string;
  emoji?: string;
  pos: string;
  key: string;
  has: boolean;
}

export function download(name: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
