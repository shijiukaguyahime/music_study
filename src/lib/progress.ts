import {
  midiLabel,
  type Clef,
  type IntervalQuestion,
  type Question,
} from "./music/theory";
import { qualityOf, type ChordQualityId, type ChordQuestion } from "./music/chord";
import { DURATION_NAMES } from "./music/rhythmQuiz";
import type { DurationId } from "./music/rhythm";
import { keySignatureLabel } from "./music/keySignature";
import { DEFAULT_SETTINGS, type TrainMode } from "./settings";

/** 某个「模式 + 谱号 + 音域」组合下的成绩 */
export interface Stats {
  total: number;
  correct: number;
  streak: number;
  best: number;
}

export const EMPTY_STATS: Stats = { total: 0, correct: 0, streak: 0, best: 0 };

/** 单个题目身份的间隔重复状态 */
export interface ItemMemory {
  /** 连续答对次数，答错归零 */
  level: number;
  /** 下次该复习的时间戳（毫秒） */
  dueAt: number;
  /** 上次作答时间戳 */
  lastAt: number;
}

/** 每个身份键保留最近多少次反应时长 */
export const REACTION_WINDOW = 20;

/** 连续答对后的复习间隔：4 小时 → 1 天 → 3 天 → 7 天 → 15 天 → 30 天 */
export const REVIEW_INTERVALS: number[] = [
  4 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
  15 * 24 * 60 * 60 * 1000,
  30 * 24 * 60 * 60 * 1000,
];

export interface Progress {
  /** key = groupKey()，按配置分开记账 */
  groups: Record<string, Stats>;
  /** 题目身份键 → 累计答错次数 */
  wrong: Record<string, number>;
  /** 题目身份键 → 累计作答次数 */
  seen: Record<string, number>;
  /** 题目身份键 → 最近若干次反应时长（毫秒） */
  reactions: Record<string, number[]>;
  /** 题目身份键 → 间隔重复状态 */
  memory: Record<string, ItemMemory>;
}

export const EMPTY_PROGRESS: Progress = {
  groups: {},
  wrong: {},
  seen: {},
  reactions: {},
  memory: {},
};

export const PROGRESS_STORAGE_KEY = "musc_demo_progress_v2";
const LEGACY_STATS_KEY = "musc_demo_stats_v1";

/** 无需谱号/音域设置的模式单独成组 */
const SIMPLE_MODES = new Set<TrainMode>(["ear", "rhythm", "sightread", "key"]);

export function isIntervalQuestion(question: Question): question is IntervalQuestion {
  return "name" in question;
}

export function isChordQuestion(question: Question): question is ChordQuestion {
  return "quality" in question;
}

export function groupKey(mode: TrainMode, clef: Clef, rangeId: string): string {
  return SIMPLE_MODES.has(mode) ? mode : `${mode}|${clef}|${rangeId}`;
}

/**
 * 一道题的稳定身份键：用于累计错题、加权出题与错题排行。
 * 单音 / 多音 / 练耳按完整音高，音程按名称，和弦按性质 + 调内级数。
 * 节奏 / 视奏 / 认调号等自定义题由组件直接给出形如 "rhythm:..." 的键。
 */
export function questionKey(mode: TrainMode, question: Question): string {
  if (mode === "interval" && isIntervalQuestion(question)) return `interval:${question.name}`;
  if (mode === "chord" && isChordQuestion(question)) {
    return `chord:${question.quality}|${question.degree ?? ""}`;
  }
  const midis = question.notes.map((note) => note.midi).sort((a, b) => a - b).join(",");
  return `${mode}:${midis}`;
}

/** 把身份键转成给人看的短标签（错题排行、练习小结用） */
export function describeQuestionKey(key: string): string {
  const split = key.indexOf(":");
  if (split < 0) return key;
  const kind = key.slice(0, split);
  const value = key.slice(split + 1);
  if (kind === "note" || kind === "ear") {
    return value.split(",").map((item) => midiLabel(Number(item))).join(" · ");
  }
  if (kind === "interval") return value;
  if (kind === "chord") {
    const [quality, degree] = value.split("|");
    const name = qualityOf(quality as ChordQualityId)?.short ?? quality;
    return degree ? `${name} · ${degree}` : name;
  }
  if (kind === "key") return keySignatureLabel(value);
  if (kind === "rhythm" || kind === "sightread") {
    const [meter, id] = value.split(":");
    const durs = (id ?? "").split(",") as DurationId[];
    const names = durs.map((dur) => DURATION_NAMES[dur] ?? dur).join(" ");
    return `${kind === "rhythm" ? "节奏" : "视奏"} ${meter ?? ""} ${names}`.trim();
  }
  return value || kind;
}

export function statsOf(progress: Progress, key: string): Stats {
  return progress.groups[key] ?? EMPTY_STATS;
}

export interface AnswerMeta {
  /** 从题目可答到作答的毫秒数 */
  reactionMs?: number;
  /** 注入当前时间，便于测试 */
  now?: number;
}

/** 记一次作答：更新成绩、错次、反应时与间隔重复状态 */
export function recordAnswer(
  progress: Progress,
  group: string,
  key: string,
  correct: boolean,
  meta: AnswerMeta = {},
): Progress {
  const current = statsOf(progress, group);
  const streak = correct ? current.streak + 1 : 0;
  const now = meta.now ?? Date.now();

  let reactions = progress.reactions;
  const reactionMs = meta.reactionMs;
  // 视奏等模式不统计反应时长（传 0），不要污染均值
  if (reactionMs !== undefined && Number.isFinite(reactionMs) && reactionMs > 0) {
    const list = progress.reactions[key] ?? [];
    reactions = {
      ...progress.reactions,
      [key]: [...list, Math.round(reactionMs)].slice(-REACTION_WINDOW),
    };
  }

  const previous = progress.memory[key] ?? { level: 0, dueAt: 0, lastAt: 0 };
  const level = correct ? previous.level + 1 : 0;
  const interval = correct
    ? REVIEW_INTERVALS[Math.min(Math.max(level - 1, 0), REVIEW_INTERVALS.length - 1)]
    : 0;

  return {
    groups: {
      ...progress.groups,
      [group]: {
        total: current.total + 1,
        correct: current.correct + (correct ? 1 : 0),
        streak,
        best: Math.max(current.best, streak),
      },
    },
    wrong: correct
      ? progress.wrong
      : { ...progress.wrong, [key]: (progress.wrong[key] ?? 0) + 1 },
    seen: { ...progress.seen, [key]: (progress.seen[key] ?? 0) + 1 },
    reactions,
    memory: {
      ...progress.memory,
      [key]: { level, dueAt: now + interval, lastAt: now },
    },
  };
}

export function resetGroup(progress: Progress, group: string): Progress {
  const groups = { ...progress.groups };
  delete groups[group];
  return { ...progress, groups };
}

function matchesMode(key: string, mode?: TrainMode): boolean {
  return !mode || key.startsWith(`${mode}:`);
}

function omitMode<T>(record: Record<string, T>, mode: TrainMode): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !key.startsWith(`${mode}:`)));
}

/** 清空题目级记录；传 mode 时只清该训练模式，保留分组成绩 */
export function clearWeakness(progress: Progress, mode?: TrainMode): Progress {
  if (!mode) return { ...progress, wrong: {}, seen: {}, reactions: {}, memory: {} };
  return {
    ...progress,
    wrong: omitMode(progress.wrong, mode),
    seen: omitMode(progress.seen, mode),
    reactions: omitMode(progress.reactions, mode),
    memory: omitMode(progress.memory, mode),
  };
}

/** 没练过、或已到复习时间的题都算「到期」 */
export function isDue(progress: Progress, key: string, now = Date.now()): boolean {
  const memory = progress.memory[key];
  return !memory || now >= memory.dueAt;
}

/**
 * 出题权重：错得越多越优先；答对后进入复习间隔的题暂时降权，
 * 到期后再回到正常池。这样会的题也会周期性复习，而不是从此消失。
 */
export function weaknessWeight(progress: Progress, key: string, now = Date.now()): number {
  const overdue = isDue(progress, key, now) ? 1 : 0;
  return 1 + 2 * (progress.wrong[key] ?? 0) + overdue;
}

export function weightedPick<T>(items: T[], weights: number[], rng: () => number = Math.random): T {
  if (items.length === 0) throw new Error("weightedPick: empty items");
  const safe = weights.map((weight) => (Number.isFinite(weight) ? Math.max(0, weight) : 0));
  const total = safe.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return items[Math.floor(rng() * items.length)];
  let roll = rng() * total;
  for (let index = 0; index < items.length; index++) {
    roll -= safe[index];
    if (roll < 0) return items[index];
  }
  return items[items.length - 1];
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export interface WeaknessRow {
  key: string;
  label: string;
  wrong: number;
  seen: number;
  rate: number;
  /** 该题最近反应时中位数（毫秒），0 表示没有记录 */
  reactionMs: number;
}

/** 排行：默认按错次，可切换成按反应慢；传 mode 时只统计该训练模式 */
export function topWeaknesses(
  progress: Progress,
  limit = 5,
  sortBy: "wrong" | "slow" = "wrong",
  mode?: TrainMode,
): WeaknessRow[] {
  const keys = new Set([
    ...Object.keys(progress.wrong),
    ...Object.keys(progress.reactions),
  ].filter((key) => matchesMode(key, mode)));
  const rows = [...keys]
    .map((key) => {
      const wrong = progress.wrong[key] ?? 0;
      const seen = Math.max(progress.seen[key] ?? 0, wrong);
      const reactionMs = median(progress.reactions[key] ?? []);
      return {
        key,
        label: describeQuestionKey(key),
        wrong,
        seen,
        rate: seen > 0 ? wrong / seen : 0,
        reactionMs,
      };
    })
    .filter((row) => (sortBy === "wrong" ? row.wrong > 0 : row.reactionMs > 0));

  rows.sort((a, b) =>
    sortBy === "slow"
      ? b.reactionMs - a.reactionMs || b.wrong - a.wrong || a.key.localeCompare(b.key)
      : b.wrong - a.wrong || b.rate - a.rate || a.key.localeCompare(b.key),
  );
  return rows.slice(0, limit);
}

export interface ReactionSummary {
  count: number;
  avgMs: number;
  medianMs: number;
  slowest: { key: string; label: string; ms: number }[];
}

/** 反应时概览 + 反应最慢的若干题；传 mode 时只统计该训练模式 */
export function reactionSummary(progress: Progress, limit = 3, mode?: TrainMode): ReactionSummary {
  const all: number[] = [];
  const perKey: { key: string; ms: number }[] = [];
  for (const [key, list] of Object.entries(progress.reactions)) {
    if (!matchesMode(key, mode) || list.length === 0) continue;
    all.push(...list);
    perKey.push({ key, ms: median(list) });
  }
  perKey.sort((a, b) => b.ms - a.ms || a.key.localeCompare(b.key));
  return {
    count: all.length,
    avgMs: all.length ? all.reduce((sum, value) => sum + value, 0) / all.length : 0,
    medianMs: median(all),
    slowest: perKey.slice(0, limit).map((item) => ({
      key: item.key,
      label: describeQuestionKey(item.key),
      ms: item.ms,
    })),
  };
}

/* ---------------- 本地持久化 ---------------- */

function isValidStats(value: unknown): value is Stats {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.total === "number" && Number.isFinite(v.total) && v.total >= 0 &&
    typeof v.correct === "number" && Number.isFinite(v.correct) && v.correct >= 0 &&
    typeof v.streak === "number" && Number.isFinite(v.streak) && v.streak >= 0 &&
    typeof v.best === "number" && Number.isFinite(v.best) && v.best >= 0
  );
}

function validCounters(value: unknown): Record<string, number> {
  if (typeof value !== "object" || value === null) return {};
  const result: Record<string, number> = {};
  for (const [key, count] of Object.entries(value as Record<string, unknown>)) {
    if (typeof count === "number" && Number.isFinite(count) && count >= 0 && key.length <= 120) {
      result[key] = Math.floor(count);
    }
  }
  return result;
}

function validGroups(value: unknown): Record<string, Stats> {
  if (typeof value !== "object" || value === null) return {};
  const result: Record<string, Stats> = {};
  for (const [key, stats] of Object.entries(value as Record<string, unknown>)) {
    if (key.length <= 120 && isValidStats(stats)) result[key] = stats;
  }
  return result;
}

function validReactions(value: unknown): Record<string, number[]> {
  if (typeof value !== "object" || value === null) return {};
  const result: Record<string, number[]> = {};
  for (const [key, list] of Object.entries(value as Record<string, unknown>)) {
    if (key.length > 120 || !Array.isArray(list)) continue;
    result[key] = list
      .filter((item): item is number => typeof item === "number" && Number.isFinite(item) && item >= 0)
      .slice(-REACTION_WINDOW);
  }
  return result;
}

function validMemory(value: unknown): Record<string, ItemMemory> {
  if (typeof value !== "object" || value === null) return {};
  const result: Record<string, ItemMemory> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key.length > 120 || typeof entry !== "object" || entry === null) continue;
    const item = entry as Record<string, unknown>;
    if (
      typeof item.level === "number" && Number.isFinite(item.level) &&
      typeof item.dueAt === "number" && Number.isFinite(item.dueAt) &&
      typeof item.lastAt === "number" && Number.isFinite(item.lastAt)
    ) {
      result[key] = { level: item.level, dueAt: item.dueAt, lastAt: item.lastAt };
    }
  }
  return result;
}

/** 旧版只有 4 个模式维度的成绩，迁到默认配置分组，避免历史数据丢失 */
function migrateLegacy(): Progress {
  try {
    const raw = localStorage.getItem(LEGACY_STATS_KEY);
    if (!raw) return { ...EMPTY_PROGRESS };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { ...EMPTY_PROGRESS };
    const groups: Record<string, Stats> = {};
    for (const mode of ["note", "interval", "ear", "chord"] as TrainMode[]) {
      const stats = (parsed as Record<string, unknown>)[mode];
      if (!isValidStats(stats)) continue;
      groups[groupKey(mode, DEFAULT_SETTINGS.clef, DEFAULT_SETTINGS.rangeId)] = stats;
    }
    return { ...EMPTY_PROGRESS, groups };
  } catch {
    return { ...EMPTY_PROGRESS };
  }
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return migrateLegacy();
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { ...EMPTY_PROGRESS };
    const v = parsed as Record<string, unknown>;
    return {
      groups: validGroups(v.groups),
      wrong: validCounters(v.wrong),
      seen: validCounters(v.seen),
      reactions: validReactions(v.reactions),
      memory: validMemory(v.memory),
    };
  } catch {
    return { ...EMPTY_PROGRESS };
  }
}

export function saveProgress(progress: Progress): void {
  try {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    /* 隐私模式等场景静默失败 */
  }
}
