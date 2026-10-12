// Klient serwera treści. Web korzysta ze ścieżki względnej (ta sama domena),
// aplikacje mobilne — z pełnego adresu redzikowski.com/multilingua.
import { db } from './db.ts';
import type { AppMeta, CoursePack, CourseSummary } from './types.ts';

export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? './api';

export class OfflineError extends Error {
  constructor() {
    super('Brak połączenia z serwerem MultiLingua.');
  }
}

async function getJson<T>(path: string, timeoutMs = 12000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, { signal: ctrl.signal, cache: 'no-cache' });
    if (!res.ok) throw new Error(`Serwer odpowiedział ${res.status} dla ${path}`);
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof TypeError || (e instanceof DOMException && e.name === 'AbortError')) throw new OfflineError();
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchMeta(): Promise<AppMeta> {
  return getJson<AppMeta>('/meta', 6000);
}

export interface CourseList {
  courses: CourseSummary[];
  /** false = lista z pamięci urządzenia (brak sieci). */
  online: boolean;
}

export async function fetchCourses(): Promise<CourseList> {
  try {
    const res = await getJson<{ courses: CourseSummary[] }>('/courses');
    return { courses: res.courses, online: true };
  } catch (e) {
    if (!(e instanceof OfflineError)) throw e;
    const cached = await db.packs.toArray();
    return { courses: cached.map((c) => summaryOf(c.pack)), online: false };
  }
}

export function summaryOf(p: CoursePack): CourseSummary {
  const { unitsData: _u, rules: _r, builtAt: _b, ...rest } = p;
  return { ...rest, size: 0 };
}

/** Kurs z pamięci urządzenia; jeśli go nie ma — pobiera z serwera. */
export async function loadPack(id: string): Promise<CoursePack> {
  const cached = await db.packs.get(id);
  if (cached) return cached.pack;
  return downloadPack(id);
}

export async function downloadPack(id: string): Promise<CoursePack> {
  const pack = await getJson<CoursePack>(`/courses/${encodeURIComponent(id)}/pack`, 30000);
  await db.packs.put({ id, hash: pack.hash, pack, fetchedAt: Date.now() });
  return pack;
}

/** Sprawdza, czy na serwerze jest nowsza wersja kursu; zwraca ją albo null. */
export async function refreshPack(id: string): Promise<CoursePack | null> {
  const cached = await db.packs.get(id);
  const { courses } = await fetchCourses();
  const remote = courses.find((c) => c.id === id);
  if (!remote || (cached && cached.hash === remote.hash)) return null;
  return downloadPack(id);
}
