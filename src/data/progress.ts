// Operacje na postępach: zapis odpowiedzi (SRS, statystyki, błędy), zakończenie
// sesji (XP, gwiazdki, seria dni) i reguły odblokowywania ścieżki.
import { review, strength, type SrsGrade, type SrsState } from '../engine/srs.ts';
import type { CourseIndex } from '../engine/course.ts';
import type { AnswerOutcome, Exercise, SessionMode, Skill } from '../engine/types.ts';
import { db, dayKey, type CourseProgress, type DayActivity, type SkillStat } from './db.ts';

const PRODUCTION = new Set(['write', 'dictation', 'speak', 'conjugate', 'number']);

export function emptyProgress(id: string): CourseProgress {
  return { id, started: Date.now(), lessons: {}, skipped: [], xp: 0, lastActive: Date.now() };
}

export async function getProgress(id: string): Promise<CourseProgress> {
  return (await db.progress.get(id)) ?? emptyProgress(id);
}

export async function loadSrs(course: string): Promise<Map<string, SrsState>> {
  const rows = await db.srs.where('course').equals(course).toArray();
  return new Map(rows.map((r) => [r.item, r]));
}

export async function loadSkillWeights(course: string): Promise<Partial<Record<Skill, number>>> {
  const rows = await db.skills.where('course').equals(course).toArray();
  const out: Partial<Record<Skill, number>> = {};
  for (const r of rows) {
    // Mało danych = neutralnie; słaba trafność = do 2× częściej.
    if (r.n >= 8) out[r.skill] = 1 + Math.max(0, 0.85 - r.acc) * 2.5;
  }
  return out;
}

function gradeOf(ex: Exercise, o: AnswerOutcome): SrsGrade {
  if (!o.ok) return 0;
  if (o.partial) return 1;
  if (PRODUCTION.has(ex.type) || (ex.type === 'cloze' && !ex.options)) return 3;
  return 2;
}

async function bumpDay(patch: Partial<Omit<DayActivity, 'day'>>, at = Date.now()) {
  const day = dayKey(at);
  await db.transaction('rw', db.activity, async () => {
    const cur = (await db.activity.get(day)) ?? { day, xp: 0, seconds: 0, lessons: 0, answers: 0, correct: 0 };
    await db.activity.put({
      day,
      xp: cur.xp + (patch.xp ?? 0),
      seconds: cur.seconds + (patch.seconds ?? 0),
      lessons: cur.lessons + (patch.lessons ?? 0),
      answers: cur.answers + (patch.answers ?? 0),
      correct: cur.correct + (patch.correct ?? 0),
    });
  });
}

/** Zapisuje wynik jednego ćwiczenia. Zwraca nowe stany SRS (do odświeżenia pamięci podręcznej). */
export async function recordAnswer(
  course: string,
  ex: Exercise,
  o: AnswerOutcome,
  prompt: string,
): Promise<SrsState[]> {
  if (o.skipped || ex.type === 'intro' || ex.type === 'theory' || ex.type === 'story') return [];
  const now = Date.now();
  const grade = gradeOf(ex, o);
  const updated: SrsState[] = [];

  await db.transaction('rw', [db.srs, db.skills, db.mistakes], async () => {
    const items: { id: string; kind: 'v' | 's' | 'c' }[] =
      ex.type === 'pairs' ? ex.pairs.map((p) => ({ id: p.id, kind: 'v' as const })) : ex.item ? [ex.item] : [];
    for (const it of items) {
      const k = `${course}:${it.id}`;
      const prev = await db.srs.get(k);
      // Ćwiczenie powtórzone po błędzie nie podnosi stabilności drugi raz.
      const g: SrsGrade = ex.retry && grade > 0 ? 1 : ex.type === 'pairs' ? (o.ok ? 2 : 1) : grade;
      const next = review(prev, { course, item: it.id, kind: it.kind }, g, now);
      await db.srs.put(next);
      updated.push(next);
    }

    const sk = `${course}:${ex.skill}`;
    const stat: SkillStat = (await db.skills.get(sk)) ?? { key: sk, course, skill: ex.skill, acc: 0.8, n: 0 };
    const alpha = stat.n < 10 ? 0.25 : 0.1;
    stat.acc = stat.acc * (1 - alpha) + (o.ok ? 1 : 0) * alpha;
    stat.n += 1;
    await db.skills.put(stat);

    if (ex.item && !o.ok) {
      await db.mistakes.add({
        course, item: ex.item.id, kind: ex.item.kind, prompt, given: o.given ?? '', correct: o.correct ?? '', at: now,
      });
      // Trzymamy ostatnie 200 błędów.
      const count = await db.mistakes.where('course').equals(course).count();
      if (count > 200) {
        const old = await db.mistakes.where('course').equals(course).sortBy('at');
        await db.mistakes.bulkDelete(old.slice(0, count - 200).map((m) => m.id!));
      }
    } else if (ex.item && o.ok && !o.partial && (await db.srs.get(`${course}:${ex.item.id}`))!.streak >= 2) {
      // Dwa poprawne z rzędu — błąd uznajemy za naprawiony.
      const itemId = ex.item.id;
      await db.mistakes.where('item').equals(itemId).and((m) => m.course === course).delete();
    }
  });

  await bumpDay({ answers: 1, correct: o.ok ? 1 : 0 }, now);
  return updated;
}

export interface SessionStats {
  total: number;
  correct: number;
  seconds: number;
  maxCombo: number;
  newWords: number;
}

export interface SessionResult {
  xp: number;
  stars: number;
  accuracy: number;
  passed: boolean;
  streak: number;
  goalReached: boolean;
  firstTime: boolean;
}

export const PASS_THRESHOLD = 0.8;

export async function finishSession(
  index: CourseIndex,
  mode: SessionMode,
  stats: SessionStats,
  dailyGoal: number,
): Promise<SessionResult> {
  const course = index.id;
  const accuracy = stats.total ? stats.correct / stats.total : 1;
  const lesson = mode.kind === 'lesson' ? index.lessons.get(mode.lessonId) : undefined;
  const isTest = lesson?.kind === 'test' || mode.kind === 'skip';
  const passed = !isTest || accuracy >= PASS_THRESHOLD;

  let xp = 0;
  if (mode.kind === 'lesson' || mode.kind === 'skip') {
    xp = passed ? 10 + (accuracy >= 0.95 ? 5 : accuracy >= 0.8 ? 2 : 0) + (isTest ? 10 : 0) : 3;
  } else if (mode.kind === 'speed') {
    xp = Math.min(20, stats.correct);
  } else {
    xp = Math.min(15, 5 + Math.round(stats.correct / 2));
  }
  xp += Math.floor(stats.maxCombo / 5);
  const stars = !passed ? 0 : accuracy >= 0.95 ? 3 : accuracy >= 0.8 ? 2 : 1;

  const before = await todayXp();
  const progress = await getProgress(course);
  let firstTime = false;
  if (lesson && passed) {
    const prev = progress.lessons[lesson.id];
    firstTime = !prev;
    progress.lessons[lesson.id] = {
      stars: Math.max(stars, prev?.stars ?? 0),
      best: Math.max(accuracy, prev?.best ?? 0),
      count: (prev?.count ?? 0) + 1,
      last: Date.now(),
    };
    progress.lastLesson = lesson.id;
  }
  if (mode.kind === 'skip' && passed && !progress.skipped.includes(mode.unitId)) {
    progress.skipped.push(mode.unitId);
    firstTime = true;
  }
  progress.xp += xp;
  progress.lastActive = Date.now();
  await db.progress.put(progress);

  await bumpDay({ xp, seconds: Math.round(stats.seconds), lessons: lesson || mode.kind === 'skip' ? 1 : 0 });
  await db.sessions.add({
    course,
    kind: mode.kind === 'lesson' ? lesson?.kind ?? 'lesson' : mode.kind,
    lesson: lesson?.id,
    at: Date.now(),
    seconds: Math.round(stats.seconds),
    total: stats.total,
    correct: stats.correct,
    xp,
  });

  return {
    xp,
    stars,
    accuracy,
    passed,
    streak: await currentStreak(),
    goalReached: before < dailyGoal && before + xp >= dailyGoal,
    firstTime,
  };
}

export async function todayXp(): Promise<number> {
  return (await db.activity.get(dayKey()))?.xp ?? 0;
}

/** Liczba kolejnych dni z nauką, licząc do dziś (albo do wczoraj, jeśli dziś jeszcze nic). */
export async function currentStreak(): Promise<number> {
  const days = new Set((await db.activity.toArray()).filter((d) => d.xp > 0).map((d) => d.day));
  let streak = 0;
  const cursor = new Date();
  if (!days.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor.getTime()))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// ——— ścieżka ———

export function isLessonDone(index: CourseIndex, p: CourseProgress, lessonId: string): boolean {
  if (p.lessons[lessonId]) return true;
  const unit = index.unitOfLesson(lessonId);
  if (!unit) return false;
  return p.skipped.some((u) => (index.unitById.get(u)?.index ?? -1) >= unit.index);
}

export function isLessonUnlocked(index: CourseIndex, p: CourseProgress, lessonId: string): boolean {
  const pos = index.lessonPosition(lessonId);
  if (pos <= 0) return pos === 0;
  return isLessonDone(index, p, lessonId) || isLessonDone(index, p, index.path[pos - 1].id);
}

export function nextLesson(index: CourseIndex, p: CourseProgress) {
  return index.path.find((l) => !isLessonDone(index, p, l.id)) ?? null;
}

export function unlockedUnits(index: CourseIndex, p: CourseProgress): Set<string> {
  const out = new Set<string>();
  for (const u of index.units) {
    if (u.lessons.some((l) => isLessonUnlocked(index, p, l.id))) out.add(u.id);
  }
  return out;
}

export function unitProgress(index: CourseIndex, p: CourseProgress, unitId: string): number {
  const u = index.unitById.get(unitId);
  if (!u || !u.lessons.length) return 0;
  return u.lessons.filter((l) => isLessonDone(index, p, l.id)).length / u.lessons.length;
}

// ——— statystyki i odznaki ———

export interface Overview {
  streak: number;
  longestStreak: number;
  totalXp: number;
  todayXp: number;
  wordsLearned: number;
  wordsStrong: number;
  sentences: number;
  lessonsDone: number;
  perfect: number;
  stories: number;
  minutes: number;
  answers: number;
  accuracy: number;
  skills: { skill: Skill; acc: number; n: number }[];
  days: DayActivity[];
  due: number;
  mistakes: number;
}

export async function overview(course?: string): Promise<Overview> {
  const now = Date.now();
  const [days, srs, sessions, skills, mistakes] = await Promise.all([
    db.activity.toArray(),
    course ? db.srs.where('course').equals(course).toArray() : db.srs.toArray(),
    course ? db.sessions.where('course').equals(course).toArray() : db.sessions.toArray(),
    course ? db.skills.where('course').equals(course).toArray() : db.skills.toArray(),
    course ? db.mistakes.where('course').equals(course).toArray() : db.mistakes.toArray(),
  ]);
  const sortedDays = days.filter((d) => d.xp > 0).map((d) => d.day).sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sortedDays) {
    if (prev) {
      const p = new Date(prev);
      p.setDate(p.getDate() + 1);
      run = dayKey(p.getTime()) === d ? run + 1 : 1;
    } else run = 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  const answers = days.reduce((a, d) => a + d.answers, 0);
  const correct = days.reduce((a, d) => a + d.correct, 0);
  return {
    streak: await currentStreak(),
    longestStreak: longest,
    totalXp: days.reduce((a, d) => a + d.xp, 0),
    todayXp: (days.find((d) => d.day === dayKey()) ?? { xp: 0 }).xp,
    wordsLearned: srs.filter((s) => s.kind === 'v').length,
    wordsStrong: srs.filter((s) => s.kind === 'v' && strength(s, now) >= 0.6).length,
    sentences: srs.filter((s) => s.kind === 's').length,
    lessonsDone: sessions.filter((s) => s.lesson).length,
    perfect: sessions.filter((s) => s.lesson && s.total >= 8 && s.correct === s.total).length,
    stories: new Set(sessions.filter((s) => s.kind === 'story').map((s) => s.lesson)).size,
    minutes: Math.round(days.reduce((a, d) => a + d.seconds, 0) / 60),
    answers,
    accuracy: answers ? correct / answers : 0,
    skills: skills.map((s) => ({ skill: s.skill, acc: s.acc, n: s.n })),
    days,
    due: srs.filter((s) => s.kind !== 'c' && s.due <= now).length,
    mistakes: new Set(mistakes.map((m) => m.item)).size,
  };
}

export interface Achievement {
  id: string;
  icon: string;
  title: string;
  desc: string;
  progress: number;
  goal: number;
}

export function achievements(o: Overview): Achievement[] {
  const speaking = o.skills.filter((s) => s.skill === 'speaking').reduce((a, s) => a + s.n, 0);
  const listening = o.skills.filter((s) => s.skill === 'listening').reduce((a, s) => a + s.n, 0);
  const a = (id: string, icon: string, title: string, desc: string, progress: number, goal: number): Achievement => ({
    id, icon, title, desc, progress: Math.min(progress, goal), goal,
  });
  return [
    a('first', '🌱', 'Pierwszy krok', 'Ukończ pierwszą lekcję', o.lessonsDone, 1),
    a('streak3', '🔥', 'Rozgrzewka', 'Ucz się 3 dni z rzędu', o.longestStreak, 3),
    a('streak7', '📅', 'Tydzień nauki', 'Ucz się 7 dni z rzędu', o.longestStreak, 7),
    a('streak30', '🏆', 'Miesiąc bez przerwy', 'Ucz się 30 dni z rzędu', o.longestStreak, 30),
    a('words50', '📗', 'Pięćdziesiątka', 'Poznaj 50 słówek', o.wordsLearned, 50),
    a('words200', '📚', 'Bogaty słownik', 'Poznaj 200 słówek', o.wordsLearned, 200),
    a('strong100', '💪', 'Mocna pamięć', 'Utrwal 100 słówek na dobre', o.wordsStrong, 100),
    a('perfect', '🎯', 'Bez pudła', 'Ukończ lekcję bez żadnego błędu', o.perfect, 1),
    a('perfect10', '🏹', 'Snajper', '10 lekcji bez błędu', o.perfect, 10),
    a('stories', '📖', 'Mól książkowy', 'Przeczytaj 5 historyjek', o.stories, 5),
    a('speaker', '🎙️', 'Gaduła', 'Wykonaj 50 ćwiczeń z mówienia', speaking, 50),
    a('listener', '🎧', 'Dobre ucho', 'Wykonaj 100 ćwiczeń ze słuchania', listening, 100),
    a('xp1000', '⭐', 'Tysiąc punktów', 'Zdobądź 1000 XP', o.totalXp, 1000),
    a('hour', '⏱️', 'Godzina z językiem', 'Ucz się łącznie 60 minut', o.minutes, 60),
  ];
}
