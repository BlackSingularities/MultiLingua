// Lokalna baza urządzenia (IndexedDB). Tu — i tylko tu — żyją postępy użytkownika.
import Dexie, { type EntityTable } from 'dexie';
import type { SrsState } from '../engine/srs.ts';
import type { Skill } from '../engine/types.ts';
import type { CoursePack, ImagePack } from './types.ts';

export interface LessonResult {
  stars: number;
  best: number;
  count: number;
  last: number;
}

export interface CourseProgress {
  id: string;
  started: number;
  lessons: Record<string, LessonResult>;
  /** Jednostki zaliczone testem „przeskocz”. */
  skipped: string[];
  xp: number;
  lastLesson?: string;
  lastActive: number;
}

export interface DayActivity {
  /** RRRR-MM-DD w lokalnej strefie czasowej. */
  day: string;
  xp: number;
  seconds: number;
  lessons: number;
  answers: number;
  correct: number;
}

export interface Mistake {
  id?: number;
  course: string;
  item: string;
  kind: 'v' | 's' | 'c';
  prompt: string;
  given: string;
  correct: string;
  at: number;
}

export interface SkillStat {
  /** `${course}:${skill}` */
  key: string;
  course: string;
  skill: Skill;
  /** Średnia krocząca trafności (0–1). */
  acc: number;
  n: number;
}

export interface CachedPack {
  id: string;
  hash: string;
  pack: CoursePack;
  fetchedAt: number;
}

/** Ilustracje kursu w pamięci urządzenia (klucz = id kursu). */
export type CachedImages = ImagePack & { fetchedAt: number };

export interface SessionLog {
  id?: number;
  course: string;
  kind: string;
  lesson?: string;
  at: number;
  seconds: number;
  total: number;
  correct: number;
  xp: number;
}

export interface Setting {
  key: string;
  value: unknown;
}

export const db = new Dexie('multilingua') as Dexie & {
  settings: EntityTable<Setting, 'key'>;
  progress: EntityTable<CourseProgress, 'id'>;
  srs: EntityTable<SrsState, 'key'>;
  activity: EntityTable<DayActivity, 'day'>;
  mistakes: EntityTable<Mistake, 'id'>;
  skills: EntityTable<SkillStat, 'key'>;
  packs: EntityTable<CachedPack, 'id'>;
  sessions: EntityTable<SessionLog, 'id'>;
  images: EntityTable<CachedImages, 'course'>;
};

db.version(1).stores({
  settings: 'key',
  progress: 'id',
  srs: 'key, course, [course+due]',
  activity: 'day',
  mistakes: '++id, course, item, at',
  skills: 'key, course',
  packs: 'id',
  sessions: '++id, course, at',
});

// 1.1: ilustracje słówek (paczki SVG pobierane osobno od treści kursu).
db.version(2).stores({ images: 'course' });

/** Tabele z danymi użytkownika (bez cache kursów) — do eksportu i resetu. */
export const USER_TABLES = ['settings', 'progress', 'srs', 'activity', 'mistakes', 'skills', 'sessions'] as const;

export function dayKey(ts: number = Date.now()): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
