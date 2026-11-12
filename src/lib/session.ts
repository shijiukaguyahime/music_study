import { median } from "./progress";
import { TRAIN_MODES, type SessionSize, type TrainMode } from "./settings";

/** 一组练习中的单次作答记录 */
export interface SessionEntry {
  key: string;
  label: string;
  correct: boolean;
  reactionMs: number;
}

export interface SessionState {
  /** 0 = 无限流，永不结束（允许任意正整数，便于测试与自定义题数） */
  size: number;
  answered: number;
  correct: number;
  entries: SessionEntry[];
  startedAt: number;
  /** answered >= size 时置 true，展示阶段小结 */
  finished: boolean;
}

/** v2：按训练模式分桶，切 tab 不再共用同一组练习 */
export const SESSION_STORAGE_KEY = "musc_demo_session_v2";
const LEGACY_SESSION_KEY = "musc_demo_session_v1";

/** 从持久化读到的分桶，可能缺某些模式 */
export type SessionMap = Partial<Record<TrainMode, SessionState>>;
/** 运行时保证每个模式都有一组，避免派生时反复新建对象 */
export type CompleteSessionMap = Record<TrainMode, SessionState>;

export function emptySession(size: number): SessionState {
  return { size, answered: 0, correct: 0, entries: [], startedAt: Date.now(), finished: false };
}

/** 记一次作答；返回新状态（纯函数，便于测试） */
export function recordSessionAnswer(
  session: SessionState,
  entry: SessionEntry,
): SessionState {
  const answered = session.answered + 1;
  const finished = session.size > 0 && answered >= session.size;
  return {
    ...session,
    answered,
    correct: session.correct + (entry.correct ? 1 : 0),
    entries: [...session.entries, entry].slice(-100),
    finished,
  };
}

export interface SessionSummary {
  total: number;
  correct: number;
  accuracy: number;
  avgMs: number;
  medianMs: number;
  wrongKeys: string[];
  slowest: { key: string; label: string; ms: number }[];
  durationMs: number;
}

export function summarizeSession(session: SessionState, now = Date.now()): SessionSummary {
  const reactions = session.entries.map((entry) => entry.reactionMs).filter((ms) => ms > 0);
  const byKey = new Map<string, { label: string; values: number[] }>();
  for (const entry of session.entries) {
    if (entry.reactionMs <= 0) continue;
    const item = byKey.get(entry.key) ?? { label: entry.label, values: [] };
    item.values.push(entry.reactionMs);
    byKey.set(entry.key, item);
  }
  const slowest = [...byKey.entries()]
    .map(([key, item]) => ({ key, label: item.label, ms: median(item.values) }))
    .sort((a, b) => b.ms - a.ms || a.key.localeCompare(b.key))
    .slice(0, 3);
  return {
    total: session.answered,
    correct: session.correct,
    accuracy: session.answered > 0 ? Math.round((session.correct / session.answered) * 100) : 0,
    avgMs: reactions.length ? reactions.reduce((sum, value) => sum + value, 0) / reactions.length : 0,
    medianMs: median(reactions),
    wrongKeys: [...new Set(session.entries.filter((entry) => !entry.correct).map((entry) => entry.key))],
    slowest,
    durationMs: Math.max(0, now - session.startedAt),
  };
}

function isValidEntry(value: unknown): value is SessionEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.key === "string" && v.key.length <= 120 &&
    typeof v.label === "string" &&
    typeof v.correct === "boolean" &&
    typeof v.reactionMs === "number" && Number.isFinite(v.reactionMs)
  );
}

function validateSession(value: unknown): SessionState | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (![0, 10, 20, 50].includes(v.size as number)) return null;
  const entries = Array.isArray(v.entries) ? v.entries.filter(isValidEntry).slice(-100) : [];
  const answered = typeof v.answered === "number" && Number.isFinite(v.answered) ? v.answered : entries.length;
  return {
    size: v.size as number,
    answered,
    correct: typeof v.correct === "number" && Number.isFinite(v.correct) ? v.correct : 0,
    entries,
    startedAt: typeof v.startedAt === "number" && Number.isFinite(v.startedAt) ? v.startedAt : Date.now(),
    finished: v.finished === true,
  };
}

/**
 * 旧版只存一组全局数据。若那组的题目身份键前缀一致，归到对应模式；
 * 混了多个模式（正是跨 tab 污染的产物）则丢弃，避免脏小结继续挂在某个 tab 上。
 */
function migrateLegacy(): SessionMap {
  try {
    const raw = localStorage.getItem(LEGACY_SESSION_KEY);
    if (!raw) return {};
    const session = validateSession(JSON.parse(raw) as unknown);
    if (!session) return {};
    const prefixes = new Set(session.entries.map((entry) => entry.key.split(":")[0]));
    if (prefixes.size === 0) return { note: session };
    if (prefixes.size > 1) return {};
    const mode = [...prefixes][0] as TrainMode;
    return TRAIN_MODES.includes(mode) ? { [mode]: session } : {};
  } catch {
    return {};
  }
}

export function loadSessions(): SessionMap {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return migrateLegacy();
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const result: SessionMap = {};
    for (const [mode, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!TRAIN_MODES.includes(mode as TrainMode)) continue;
      const session = validateSession(value);
      if (session) result[mode as TrainMode] = session;
    }
    return result;
  } catch {
    return {};
  }
}

export function saveSessions(sessions: SessionMap): void {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    /* 隐私模式等场景静默失败 */
  }
}

/** 补齐所有模式的空组；size 用当前设置作为新组的默认题数 */
export function ensureSessions(sessions: SessionMap, size: SessionSize): CompleteSessionMap {
  const result = { ...sessions } as CompleteSessionMap;
  for (const mode of TRAIN_MODES) {
    if (!result[mode]) result[mode] = emptySession(size);
  }
  return result;
}
