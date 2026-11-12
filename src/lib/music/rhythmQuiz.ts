import type { MeterId } from "../settings";
import {
  RHYTHM_POOL,
  barBeats,
  durationBeats,
  type DurationId,
} from "./rhythm";

export interface RhythmPattern {
  /** 稳定身份键（拍号 + 时值序列） */
  id: string;
  meter: MeterId;
  durs: DurationId[];
  beats: number;
  /** 文字描述，如「四分 八分 八分 四分」 */
  description: string;
}

export interface RhythmQuestion {
  pattern: RhythmPattern;
  options: RhythmPattern[];
}

export const DURATION_NAMES: Record<DurationId, string> = {
  w: "全", h: "二分", q: "四分", "8": "八分", "16": "十六分",
  "h.": "附点二分", "q.": "附点四分", "8.": "附点八分",
};

/** 时值条上显示的短标签（避免依赖音乐符号字体） */
export const DURATION_SYMBOLS: Record<DurationId, string> = {
  w: "全", h: "二", q: "四", "8": "八", "16": "十六",
  "h.": "二·", "q.": "四·", "8.": "八·",
};

function shuffle<T>(list: T[], rng: () => number): T[] {
  const result = [...list];
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(rng() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function makePattern(meter: MeterId, durs: DurationId[]): RhythmPattern {
  return {
    id: durs.join(","),
    meter,
    durs,
    beats: barBeats(durs.map((dur) => ({ note: null, dur }))),
    description: durs.map((dur) => DURATION_NAMES[dur]).join(" "),
  };
}

/** 同拍号下所有不重复的节奏型 */
export function rhythmPatterns(meter: MeterId): RhythmPattern[] {
  const pool = RHYTHM_POOL[meter] ?? RHYTHM_POOL["4/4"];
  const unique = new Map<string, DurationId[]>();
  for (const durs of pool) unique.set(durs.join(","), durs);
  return [...unique.entries()].map(([, durs]) => makePattern(meter, durs));
}

/** 出一道节奏听辨题：正确项 + 3 个同拍号干扰项，打乱顺序 */
export function generateRhythmQuestion(meter: MeterId, rng: () => number = Math.random): RhythmQuestion {
  const pool = rhythmPatterns(meter);
  const correct = pool[Math.floor(rng() * pool.length)];
  const others = shuffle(pool.filter((item) => item.id !== correct.id), rng).slice(0, 3);
  return { pattern: correct, options: shuffle([correct, ...others], rng) };
}

/** 从身份键还原节奏型（本组错题复习用） */
export function rhythmPatternFromKey(key: string): RhythmPattern | null {
  const [kind, meter, id] = key.split(":");
  if (kind !== "rhythm" || !meter || !id) return null;
  const durs = id.split(",") as DurationId[];
  if (durs.length === 0 || durs.some((dur) => !(dur in DURATION_SYMBOLS))) return null;
  return makePattern(meter as MeterId, durs);
}

/** 按指定正确项构造一道节奏题（错题复习时保证抽到那道题） */
export function rhythmQuestionFor(
  pattern: RhythmPattern,
  rng: () => number = Math.random,
): RhythmQuestion {
  const pool = rhythmPatterns(pattern.meter);
  const others = shuffle(pool.filter((item) => item.id !== pattern.id), rng).slice(0, 3);
  return { pattern, options: shuffle([pattern, ...others], rng) };
}

/** 稳定身份键，用于错题与反应时记账 */
export function patternKey(pattern: RhythmPattern): string {
  return `rhythm:${pattern.meter}:${pattern.id}`;
}

/** 每个音的起始时刻（秒）与整小节长度 */
export function rhythmTimeline(pattern: RhythmPattern, bpm: number): { onsets: number[]; totalSec: number } {
  const spb = 60 / Math.min(260, Math.max(30, bpm));
  const onsets: number[] = [];
  let cursor = 0;
  for (const dur of pattern.durs) {
    onsets.push(cursor);
    cursor += durationBeats(dur) * spb;
  }
  return { onsets, totalSec: cursor };
}

/** 时值条各段的宽度占比 */
export function patternWidths(pattern: RhythmPattern): number[] {
  const total = pattern.durs.reduce((sum, dur) => sum + durationBeats(dur), 0);
  return pattern.durs.map((dur) => (durationBeats(dur) / total) * 100);
}
