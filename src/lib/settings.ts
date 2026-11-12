import type { ChordModeId } from "./music/chord";
import type { Clef, EarGuideMode } from "./music/theory";

/** 训练模式 / 和弦题型 / 和弦范围 / 拍号 / 乐句调式：设置项与 UI 共用的枚举 */
export type TrainMode =
  | "note" | "interval" | "ear" | "chord"
  | "rhythm" | "sightread" | "key";
export type ChordTask = "identify" | "play";
export type ChordScope = "triad" | "seventh" | "both";
export type MeterId = "2/4" | "3/4" | "4/4";
export type PhraseModeId = "major" | "naturalMinor";
/** 音程 / 和弦题的呈现方式 */
export type Presentation = "visual" | "aural" | "mixed";
/** 答案与音名的显示标记 */
export type NoteLabelMode = "letter" | "solfege" | "number";
/** 0 = 无限流 */
export type SessionSize = 0 | 10 | 20 | 50;
export type KeyQuizScope = "major" | "minor" | "both";
export type WeaknessSort = "wrong" | "slow";

export interface Settings {
  mode: TrainMode;
  clef: Clef;
  rangeId: string;
  allowAccidentals: boolean;
  noteCount: number;
  /** 音符显示时长（秒）的原始输入，空串 / 0 表示常显 */
  showDuration: string;
  /** 练耳引导：关闭 / 开启（1234567 · 6 · ？，固定 90 BPM） */
  earGuideMode: EarGuideMode;
  chordMode: ChordModeId;
  chordRootPc: number;
  chordTask: ChordTask;
  chordDiatonic: boolean;
  chordScope: ChordScope;
  chordInversions: boolean;
  /** 答错时停在本题，等用户手动进入下一题 */
  wrongManualNext: boolean;
  /** 只从错过的题目里出（没有错题时退回全部） */
  focusWeak: boolean;
  /** 一组练习的题数，0 = 无限流 */
  sessionSize: SessionSize;
  /** 音程 / 和弦：看谱 / 听音 / 每题随机 */
  presentation: Presentation;
  /** 音名 / 首调唱名 / 简谱数字 */
  noteLabelMode: NoteLabelMode;
  /** 谱面是否画调号 */
  showKeySignature: boolean;
  /** 谱面调号（VexFlow spec，如 C / G / Bb / Em） */
  keySig: string;
  /** 认调号题的范围 */
  keyQuizScope: KeyQuizScope;
  /** 易错排行按错次还是反应慢 */
  weaknessSort: WeaknessSort;
  /** 节拍器与乐句视唱共享速度 */
  bpm: number;
  /** 节拍器强拍与乐句拍号共享 */
  meter: MeterId;
  metronomeVolume: number;
  phraseBars: 2 | 4;
  phraseKeyMode: PhraseModeId;
  phraseRootPc: number;
  /** 乐句 / 视奏播放前按拍号给一整小节预备拍 */
  countIn: boolean;
  /** 是否接入 Web MIDI 键盘（需浏览器授权） */
  midiEnabled: boolean;
}

export const SETTINGS_STORAGE_KEY = "musc_demo_settings_v1";

export const DEFAULT_SETTINGS: Settings = {
  mode: "note",
  clef: "treble",
  rangeId: "c4-c6",
  allowAccidentals: false,
  noteCount: 1,
  showDuration: "",
  earGuideMode: "on",
  chordMode: "major",
  chordRootPc: 0,
  chordTask: "identify",
  chordDiatonic: true,
  chordScope: "both",
  chordInversions: true,
  wrongManualNext: true,
  focusWeak: false,
  sessionSize: 20,
  presentation: "visual",
  noteLabelMode: "letter",
  showKeySignature: false,
  keySig: "C",
  keyQuizScope: "both",
  weaknessSort: "wrong",
  bpm: 84,
  meter: "4/4",
  metronomeVolume: 100,
  phraseBars: 2,
  phraseKeyMode: "major",
  phraseRootPc: 0,
  countIn: true,
  midiEnabled: false,
};

/** 全部训练模式（顶栏 tab），一组练习按此分桶 */
export const TRAIN_MODES: TrainMode[] = [
  "note", "interval", "ear", "chord", "rhythm", "sightread", "key",
];
const CLEFS: Clef[] = ["treble", "bass", "grand"];
const CHORD_MODES: ChordModeId[] = ["major", "naturalMinor", "harmonicMinor"];
const EAR_GUIDE_MODES: EarGuideMode[] = ["off", "on"];
const METERS: MeterId[] = ["2/4", "3/4", "4/4"];
const KEY_SIG_SPECS = [
  "C", "G", "D", "A", "E", "B", "F#", "C#",
  "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb",
  "Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "A#m",
  "Dm", "Gm", "Cm", "Fm", "Bbm", "Ebm", "Abm",
];
const PHRASE_MODES: PhraseModeId[] = ["major", "naturalMinor"];

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function num(value: unknown, lo: number, hi: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(hi, Math.max(lo, Math.round(value)))
    : fallback;
}

/** 合并持久化数据：逐字段校验，坏值 / 旧版本缺字段一律回落到默认值 */
export function normalizeSettings(raw: unknown): Settings {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_SETTINGS };
  const v = raw as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  // 早期版本有 short / full 三档，统一归到开启
  const legacyGuide = v.earGuideMode === "short" || v.earGuideMode === "full" ? "on" : v.earGuideMode;
  const sessionSize = num(v.sessionSize, 0, 50, d.sessionSize);
  return {
    mode: oneOf(v.mode, TRAIN_MODES, d.mode),
    clef: oneOf(v.clef, CLEFS, d.clef),
    rangeId: typeof v.rangeId === "string" && v.rangeId.length <= 40 ? v.rangeId : d.rangeId,
    allowAccidentals: bool(v.allowAccidentals, d.allowAccidentals),
    noteCount: num(v.noteCount, 1, 4, d.noteCount),
    showDuration: typeof v.showDuration === "string" && v.showDuration.length <= 12 ? v.showDuration : d.showDuration,
    earGuideMode: oneOf(legacyGuide, EAR_GUIDE_MODES, d.earGuideMode),
    chordMode: oneOf(v.chordMode, CHORD_MODES, d.chordMode),
    chordRootPc: num(v.chordRootPc, 0, 11, d.chordRootPc),
    chordTask: oneOf(v.chordTask, ["identify", "play"] as ChordTask[], d.chordTask),
    chordDiatonic: bool(v.chordDiatonic, d.chordDiatonic),
    chordScope: oneOf(v.chordScope, ["triad", "seventh", "both"] as ChordScope[], d.chordScope),
    chordInversions: bool(v.chordInversions, d.chordInversions),
    wrongManualNext: bool(v.wrongManualNext, d.wrongManualNext),
    focusWeak: bool(v.focusWeak, d.focusWeak),
    sessionSize: ([0, 10, 20, 50] as number[]).includes(sessionSize) ? (sessionSize as SessionSize) : d.sessionSize,
    presentation: oneOf(v.presentation, ["visual", "aural", "mixed"] as Presentation[], d.presentation),
    noteLabelMode: oneOf(v.noteLabelMode, ["letter", "solfege", "number"] as NoteLabelMode[], d.noteLabelMode),
    showKeySignature: bool(v.showKeySignature, d.showKeySignature),
    keySig: oneOf(v.keySig, KEY_SIG_SPECS, d.keySig),
    keyQuizScope: oneOf(v.keyQuizScope, ["major", "minor", "both"] as KeyQuizScope[], d.keyQuizScope),
    weaknessSort: oneOf(v.weaknessSort, ["wrong", "slow"] as WeaknessSort[], d.weaknessSort),
    bpm: num(v.bpm, 30, 260, d.bpm),
    meter: oneOf(v.meter, METERS, d.meter),
    metronomeVolume: num(v.metronomeVolume, 0, 100, d.metronomeVolume),
    phraseBars: num(v.phraseBars, 2, 4, d.phraseBars) === 4 ? 4 : 2,
    phraseKeyMode: oneOf(v.phraseKeyMode, PHRASE_MODES, d.phraseKeyMode),
    phraseRootPc: num(v.phraseRootPc, 0, 11, d.phraseRootPc),
    countIn: bool(v.countIn, d.countIn),
    midiEnabled: bool(v.midiEnabled, d.midiEnabled),
  };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return normalizeSettings(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* 隐私模式等场景静默失败 */
  }
}
