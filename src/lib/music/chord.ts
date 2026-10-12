import {
  LETTERS,
  LETTER_INDEX,
  LETTER_MIDI,
  accSymbol,
  octaveOf,
  pcOf,
  type Accidental,
  type Clef,
  type Letter,
  type Note,
  type Question,
  type Range,
} from "./theory";

function shuffle<T>(list: T[]): T[] {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/* ---------------- 调式与调 ---------------- */

export type ChordModeId = "major" | "naturalMinor" | "harmonicMinor";

export const CHORD_MODE_LABELS: Record<ChordModeId, string> = {
  major: "大调",
  naturalMinor: "自然小调",
  harmonicMinor: "和声小调",
};

export interface ChordKey {
  mode: ChordModeId;
  /** 主音音级 0-11，C=0 */
  rootPc: number;
}

interface KeyDef {
  tonic: [Letter, Accidental];
  /** 调号：正数=升号个数，负数=降号个数 */
  sig: number;
}

const MAJOR_KEYS: Record<number, KeyDef> = {
  0: { tonic: ["C", ""], sig: 0 },
  1: { tonic: ["D", "b"], sig: -5 },
  2: { tonic: ["D", ""], sig: 2 },
  3: { tonic: ["E", "b"], sig: -3 },
  4: { tonic: ["E", ""], sig: 4 },
  5: { tonic: ["F", ""], sig: -1 },
  6: { tonic: ["F", "#"], sig: 6 },
  7: { tonic: ["G", ""], sig: 1 },
  8: { tonic: ["A", "b"], sig: -4 },
  9: { tonic: ["A", ""], sig: 3 },
  10: { tonic: ["B", "b"], sig: -2 },
  11: { tonic: ["B", ""], sig: 5 },
};

const MINOR_KEYS: Record<number, KeyDef> = {
  0: { tonic: ["C", ""], sig: -3 },
  1: { tonic: ["C", "#"], sig: 4 },
  2: { tonic: ["D", ""], sig: -1 },
  3: { tonic: ["E", "b"], sig: -6 },
  4: { tonic: ["E", ""], sig: 1 },
  5: { tonic: ["F", ""], sig: -4 },
  6: { tonic: ["F", "#"], sig: 3 },
  7: { tonic: ["G", ""], sig: -2 },
  8: { tonic: ["G", "#"], sig: 5 },
  9: { tonic: ["A", ""], sig: 0 },
  10: { tonic: ["B", "b"], sig: -5 },
  11: { tonic: ["B", ""], sig: 2 },
};

const SHARP_ORDER: Letter[] = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_ORDER: Letter[] = ["B", "E", "A", "D", "G", "C", "F"];

function keyDef(key: ChordKey): KeyDef {
  // 和声小调 G♯（pc8）的导音会变成 F𝄪（双升），改用等音的 A♭ 小调（7 个降号）拼写
  if (key.mode === "harmonicMinor" && key.rootPc === 8) return { tonic: ["A", "b"], sig: -7 };
  return key.mode === "major" ? MAJOR_KEYS[key.rootPc] : MINOR_KEYS[key.rootPc];
}

function alteredSet(sig: number): Map<Letter, Accidental> {
  const result = new Map<Letter, Accidental>();
  const order = sig > 0 ? SHARP_ORDER : FLAT_ORDER;
  for (let i = 0; i < Math.abs(sig); i++) result.set(order[i], sig > 0 ? "#" : "b");
  return result;
}

/** 调的显示名，如「C大调」「G♯和声小调」 */
export function chordKeyLabel(key: ChordKey): string {
  const { tonic } = keyDef(key);
  return `${tonic[0]}${accSymbol(tonic[1])}${CHORD_MODE_LABELS[key.mode]}`;
}

/** 调内音阶：7 个音级（按音级顺序，含正确的字母与升降号拼写；和声小调升第 7 级） */
export function scaleOf(key: ChordKey): { letter: Letter; acc: Accidental; pc: number }[] {
  const { tonic, sig } = keyDef(key);
  const alt = alteredSet(sig);
  const start = LETTER_INDEX[tonic[0]];
  const result = Array.from({ length: 7 }, (_, i) => {
    const letter = LETTERS[(start + i) % 7];
    const acc = alt.get(letter) ?? "";
    const pc = (LETTER_MIDI[letter] + (acc === "#" ? 1 : acc === "b" ? -1 : 0) + 12) % 12;
    return { letter, acc, pc };
  });
  if (key.mode === "harmonicMinor") {
    // 和声小调：升高第 7 级（♭ → 还原，还原 → 升）
    const s = result[6];
    const acc: Accidental = s.acc === "b" ? "" : "#";
    result[6] = {
      letter: s.letter,
      acc,
      pc: (LETTER_MIDI[s.letter] + (acc === "#" ? 1 : 0) + 12) % 12,
    };
  }
  return result;
}

/** 12 个主音在该调式下的拼写标签（用于设置下拉） */
export function chordRootLabels(mode: ChordModeId): string[] {
  return Array.from({ length: 12 }, (_, pc) => {
    const { tonic } = keyDef({ mode, rootPc: pc });
    return `${tonic[0]}${accSymbol(tonic[1])}`;
  });
}

/* ---------------- 和弦性质 ---------------- */

export type ChordQualityId =
  | "maj"
  | "min"
  | "dim"
  | "aug"
  | "maj7"
  | "dom7"
  | "m7"
  | "m7b5"
  | "dim7"
  | "mMaj7";

export interface ChordQuality {
  id: ChordQualityId;
  /** 中文全名，如「大三和弦」 */
  zh: string;
  /** 按钮短名，如「大三」 */
  short: string;
  /** 从根音起的半音集合 */
  intervals: number[];
  isSeventh: boolean;
  /** 字母记号后缀，如 "m7♭5"（大三为空串） */
  symbol: string;
}

export const CHORD_QUALITIES: ChordQuality[] = [
  { id: "maj", zh: "大三和弦", short: "大三", intervals: [0, 4, 7], isSeventh: false, symbol: "" },
  { id: "min", zh: "小三和弦", short: "小三", intervals: [0, 3, 7], isSeventh: false, symbol: "m" },
  { id: "dim", zh: "减三和弦", short: "减三", intervals: [0, 3, 6], isSeventh: false, symbol: "°" },
  { id: "aug", zh: "增三和弦", short: "增三", intervals: [0, 4, 8], isSeventh: false, symbol: "+" },
  { id: "maj7", zh: "大七和弦", short: "大七", intervals: [0, 4, 7, 11], isSeventh: true, symbol: "maj7" },
  { id: "dom7", zh: "属七和弦", short: "属七", intervals: [0, 4, 7, 10], isSeventh: true, symbol: "7" },
  { id: "m7", zh: "小七和弦", short: "小七", intervals: [0, 3, 7, 10], isSeventh: true, symbol: "m7" },
  {
    id: "m7b5",
    zh: "半减七和弦",
    short: "半减七",
    intervals: [0, 3, 6, 10],
    isSeventh: true,
    symbol: "m7♭5",
  },
  { id: "dim7", zh: "减七和弦", short: "减七", intervals: [0, 3, 6, 9], isSeventh: true, symbol: "°7" },
  {
    id: "mMaj7",
    zh: "小大七和弦",
    short: "小大七",
    intervals: [0, 3, 7, 11],
    isSeventh: true,
    symbol: "m(maj7)",
  },
];

const QUALITY_BY_ID = new Map(CHORD_QUALITIES.map((item) => [item.id, item]));

export function qualityOf(id: ChordQualityId): ChordQuality {
  return QUALITY_BY_ID.get(id)!;
}

/** 性质选项池：三和弦/七和弦各是一个完整小班 */
export function qualityPool(isSeventh: boolean): ChordQualityId[] {
  return CHORD_QUALITIES.filter((item) => item.isSeventh === isSeventh).map((item) => item.id);
}

/* ---------------- 调内级数 ---------------- */

interface DegreeDef {
  roman: string;
  /** 七和弦罗马字与三和弦不同时（半减七用 ø，如 viiø） */
  romanSeventh?: string;
  triad: ChordQualityId;
  seventh: ChordQualityId;
}

const MAJOR_DEGREES: DegreeDef[] = [
  { roman: "I", triad: "maj", seventh: "maj7" },
  { roman: "ii", triad: "min", seventh: "m7" },
  { roman: "iii", triad: "min", seventh: "m7" },
  { roman: "IV", triad: "maj", seventh: "maj7" },
  { roman: "V", triad: "maj", seventh: "dom7" },
  { roman: "vi", triad: "min", seventh: "m7" },
  { roman: "vii°", romanSeventh: "viiø", triad: "dim", seventh: "m7b5" },
];

const NAT_MINOR_DEGREES: DegreeDef[] = [
  { roman: "i", triad: "min", seventh: "m7" },
  { roman: "ii°", romanSeventh: "iiø", triad: "dim", seventh: "m7b5" },
  { roman: "III", triad: "maj", seventh: "maj7" },
  { roman: "iv", triad: "min", seventh: "m7" },
  { roman: "v", triad: "min", seventh: "m7" },
  { roman: "VI", triad: "maj", seventh: "maj7" },
  { roman: "VII", triad: "maj", seventh: "dom7" },
];

// 和声小调 III 级七和弦是 maj7♯5（极少考），七和弦题跳过该级
const HARM_MINOR_DEGREES: DegreeDef[] = [
  { roman: "i", triad: "min", seventh: "mMaj7" },
  { roman: "ii°", romanSeventh: "iiø", triad: "dim", seventh: "m7b5" },
  { roman: "III", triad: "aug", seventh: "maj7" },
  { roman: "iv", triad: "min", seventh: "m7" },
  { roman: "V", triad: "maj", seventh: "dom7" },
  { roman: "VI", triad: "maj", seventh: "maj7" },
  { roman: "vii°", triad: "dim", seventh: "dim7" },
];

const DEGREES: Record<ChordModeId, DegreeDef[]> = {
  major: MAJOR_DEGREES,
  naturalMinor: NAT_MINOR_DEGREES,
  harmonicMinor: HARM_MINOR_DEGREES,
};

/**
 * 级数标记：
 * - 三和弦：罗马字 + 无/6/64
 * - 七和弦根位带质量后缀：Imaj7、V7、i7、iiø7、vii°7、i(maj7)
 * - 七和弦转位只缀数字（65/43/42），调内上下文无歧义；ø/° 保留
 */
function degreeLabelFor(def: DegreeDef, inversion: number, isSeventh: boolean): string {
  if (!isSeventh) return def.roman + (["", "6", "64"][inversion] ?? "");
  if (def.seventh === "m7b5") {
    return (def.romanSeventh ?? def.roman) + (["7", "65", "43", "42"][inversion] ?? "7");
  }
  if (def.seventh === "dim7") {
    return def.roman + (["7", "65", "43", "42"][inversion] ?? "7");
  }
  if (def.seventh === "mMaj7") {
    return inversion === 0 ? def.roman + "(maj7)" : def.roman + (["", "65", "43", "42"][inversion] ?? "");
  }
  if (def.seventh === "maj7") {
    return inversion === 0 ? def.roman + "maj7" : def.roman + (["", "65", "43", "42"][inversion] ?? "");
  }
  // 属七 / 小七：根位 roman+7，转位 roman+数字
  return inversion === 0 ? def.roman + "7" : def.roman + (["", "65", "43", "42"][inversion] ?? "");
}

export function inversionZh(inversion: number): string {
  return ["", "第一转位", "第二转位", "第三转位"][inversion] ?? "";
}

/** 某调式下可能出现的全部级数标记（选项池） */
export function degreePool(key: ChordKey, isSeventh: boolean, allowInversions: boolean): string[] {
  const inversions = allowInversions ? (isSeventh ? [0, 1, 2, 3] : [0, 1, 2]) : [0];
  return DEGREES[key.mode].flatMap((def) =>
    inversions.map((inv) => degreeLabelFor(def, inv, isSeventh)),
  );
}

/* ---------------- 题目 ---------------- */

export interface ChordQuestion extends Question {
  quality: ChordQualityId;
  /** 转位：0=根位 */
  inversion: number;
  isSeventh: boolean;
  /** 字母记号（含转位斜杠），如 G7/B */
  symbol: string;
  /** 性质中文全名 */
  qualityName: string;
  /** 转位中文名（根位为空串） */
  inversionName: string;
  /** 调内题：调；任意和弦题为 null */
  key: ChordKey | null;
  /** 调内题：级数标记（含转位数字），如 V65；任意和弦题为 null */
  degree: string | null;
}

export interface ChordQuestionOptions {
  diatonic: boolean;
  key: ChordKey;
  scope: "triad" | "seventh" | "both";
  allowInversions: boolean;
  range: Range;
  clef: Clef;
}

/** 任意和弦根音的常用拼写（按音级） */
const ROOT_SPELL: [Letter, Accidental][] = [
  ["C", ""],
  ["D", "b"],
  ["D", ""],
  ["E", "b"],
  ["E", ""],
  ["F", ""],
  ["F", "#"],
  ["G", ""],
  ["A", "b"],
  ["A", ""],
  ["B", "b"],
  ["B", ""],
];

/** 转位后的紧密排列半音程（相对低音），如 [0,4,7] 第一转位 → [0,3,8] */
export function rotateIntervals(intervals: number[], inversion: number): number[] {
  const bass = intervals[inversion];
  const rotated = [...intervals.slice(inversion), ...intervals.slice(0, inversion).map((x) => x + 12)];
  return rotated.map((x) => x - bass);
}

function pickBass(lo: number, hi: number, span: number): number {
  const maxBass = hi - span;
  if (maxBass < lo) return lo;
  return lo + Math.floor(Math.random() * (maxBass - lo + 1));
}

/** 在 [lo, hi] 内取指定音级的全部 midi（用于调内题把低音钉在正确的音级上） */
function midisWithPc(lo: number, hi: number, pc: number): number[] {
  const result: number[] = [];
  for (let midi = lo; midi <= hi; midi++) if (pcOf(midi) === pc) result.push(midi);
  return result;
}

/** 单个升降号能表达时返回该记号，否则 null */
function singleAcc(pc: number, letter: Letter): Accidental | null {
  const diff = ((pc - LETTER_MIDI[letter]) % 12 + 12) % 12;
  if (diff === 0) return "";
  if (diff === 1) return "#";
  if (diff === 11) return "b";
  return null;
}

/**
 * 和弦音拼写：优先按三度叠置的字母，单个升降号表达不了时
 * （如 C°7 的 B𝄫）改用等音的邻近字母（→ A♮），与通行记谱一致。
 */
function spellTone(midi: number, preferred: Letter): { letter: Letter; acc: Accidental } {
  const pc = pcOf(midi);
  const direct = singleAcc(pc, preferred);
  if (direct !== null) return { letter: preferred, acc: direct };
  const idx = LETTER_INDEX[preferred];
  const down = LETTERS[(idx + 6) % 7];
  const accDown = singleAcc(pc, down);
  if (accDown !== null) return { letter: down, acc: accDown };
  const up = LETTERS[(idx + 1) % 7];
  const accUp = singleAcc(pc, up);
  if (accUp !== null) return { letter: up, acc: accUp };
  return { letter: preferred, acc: "" };
}

export function generateChordQuestion(options: ChordQuestionOptions): ChordQuestion {
  const { diatonic, key, scope, allowInversions, range, clef } = options;
  const isSeventh = scope === "seventh" ? true : scope === "triad" ? false : Math.random() < 0.5;

  let qualityId: ChordQualityId;
  let degreeIndex = -1;
  let inversion = 0;
  let bassMidi: number;

  if (diatonic) {
    // 和声小调七和弦跳过 III 级（maj7♯5）
    const degrees =
      key.mode === "harmonicMinor" && isSeventh ? [0, 1, 3, 4, 5, 6] : [0, 1, 2, 3, 4, 5, 6];
    const scale = scaleOf(key);
    const inversions = allowInversions ? (isSeventh ? [0, 1, 2, 3] : [0, 1, 2]) : [0];
    // 枚举（级数 × 转位 × 音域内可行的低音），保证低音音级 = 该转位应有的音级
    const candidates: { degree: number; inv: number; bass: number }[] = [];
    for (const degree of degrees) {
      const def = DEGREES[key.mode][degree];
      const ivs = qualityOf(isSeventh ? def.seventh : def.triad).intervals;
      for (const inv of inversions) {
        const span = inv === 0 ? ivs[ivs.length - 1] : ivs[inv - 1] + 12 - ivs[inv];
        const bassPc = (scale[degree].pc + ivs[inv]) % 12;
        for (const bass of midisWithPc(range.lo, range.hi - span, bassPc)) {
          candidates.push({ degree, inv, bass });
        }
      }
    }
    const picked = candidates.length
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : { degree: degrees[0], inv: 0, bass: range.lo };
    degreeIndex = picked.degree;
    inversion = picked.inv;
    bassMidi = picked.bass;
    const def = DEGREES[key.mode][degreeIndex];
    qualityId = isSeventh ? def.seventh : def.triad;
  } else {
    const pool = qualityPool(isSeventh);
    qualityId = pool[Math.floor(Math.random() * pool.length)];
    inversion = allowInversions ? Math.floor(Math.random() * (isSeventh ? 4 : 3)) : 0;
    const rotFree = rotateIntervals(qualityOf(qualityId).intervals, inversion);
    bassMidi = pickBass(range.lo, range.hi, rotFree[rotFree.length - 1]);
  }

  const quality = qualityOf(qualityId);
  const rot = rotateIntervals(quality.intervals, inversion);

  const scale = diatonic ? scaleOf(key) : null;
  const notes: Note[] = [];
  for (let k = 0; k < rot.length; k++) {
    const midi = bassMidi + rot[k];
    let letter: Letter;
    let acc: Accidental;
    if (scale && degreeIndex >= 0) {
      // 转位绕回根音时三度序号要对和弦音数取模（midi 侧已由旋转 +12 处理）
      const tone = (inversion + k) % quality.intervals.length;
      const entry = scale[((degreeIndex + 2 * tone) % 7 + 7) % 7];
      letter = entry.letter;
      acc = entry.acc;
    } else {
      // 根音音级 = 低音音级 − 转位偏离根音的半音数
      const rootPc = (pcOf(bassMidi) - quality.intervals[inversion] + 120) % 12;
      const [rootLetter] = ROOT_SPELL[rootPc];
      const tone = (inversion + k) % quality.intervals.length;
      const preferred = LETTERS[(LETTER_INDEX[rootLetter] + 2 * tone) % 7];
      const spelled = spellTone(midi, preferred);
      letter = spelled.letter;
      acc = spelled.acc;
    }
    notes.push({ midi, pc: pcOf(midi), letter, acc, octave: octaveOf(midi) });
  }
  notes.sort((a, b) => a.midi - b.midi);

  // 字母记号：根音名 + 性质后缀 + 转位斜杠（低音）
  const rootSpell: [Letter, Accidental] = scale && degreeIndex >= 0
    ? [scale[degreeIndex].letter, scale[degreeIndex].acc]
    : ROOT_SPELL[(pcOf(bassMidi) - quality.intervals[inversion] + 120) % 12];
  const bassNote = notes[0];
  const symbol =
    `${rootSpell[0]}${accSymbol(rootSpell[1])}${quality.symbol}` +
    (inversion > 0 ? `/${bassNote.letter}${accSymbol(bassNote.acc)}` : "");

  const degree = diatonic
    ? degreeLabelFor(DEGREES[key.mode][degreeIndex], inversion, isSeventh)
    : null;

  return {
    staff: clef === "grand" ? (notes[0].midi >= 60 ? "treble" : "bass") : clef,
    notes,
    layout: "chord",
    quality: qualityId,
    inversion,
    isSeventh,
    symbol,
    qualityName: quality.zh,
    inversionName: inversionZh(inversion),
    key: diatonic ? key : null,
    degree,
  };
}

/** 弹和弦题的提示行（调与级数，或性质） */
export function chordPromptDesc(q: ChordQuestion): string {
  const inv = q.inversionName ? ` · ${q.inversionName}` : "";
  if (q.key && q.degree) return `${chordKeyLabel(q.key)} · ${q.degree}${inv}`;
  return `${q.qualityName}${inv}`;
}

/** 完整答案描述（弹和弦揭晓） */
export function chordAnswerText(q: ChordQuestion): string {
  const inv = q.inversionName ? ` ${q.inversionName}` : "";
  if (q.key && q.degree) return `${chordKeyLabel(q.key)} ${q.degree}${inv}（${q.symbol}）`;
  return `${q.qualityName}${inv}（${q.symbol}）`;
}

/** 从选项池里取「正确项 + 3 个干扰项」并打乱 */
export function sampleOptions(correct: string, pool: string[]): string[] {
  const others = shuffle(pool.filter((item) => item !== correct));
  return shuffle([correct, ...others.slice(0, 3)]);
}
