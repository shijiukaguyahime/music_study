export type Clef = "treble" | "bass" | "grand";
export type Staff = "treble" | "bass";
export type Letter = "C" | "D" | "E" | "F" | "G" | "A" | "B";
export type Accidental = "" | "#" | "b";

export interface Note {
  /** MIDI 音高（唯一真实值） */
  midi: number;
  /** 音级 0-11，C=0 */
  pc: number;
  letter: Letter;
  acc: Accidental;
  octave: number;
}

export interface Range {
  id: string;
  label: string;
  lo: number;
  hi: number;
}

/** 组音在谱面上的排列：chord=并行叠置；sequence=从低到高依次散开 */
export type NoteLayout = "chord" | "sequence";

/** 一道题：记在哪一条谱表上 + 要认的音 */
export interface Question {
  staff: Staff;
  notes: Note[];
  layout: NoteLayout;
}

/** 音程题：两个音 + 音程名称 */
export interface IntervalQuestion extends Question {
  lower: Note;
  upper: Note;
  name: string;
}

export const MAX_NOTES = 4;

export const LETTERS: Letter[] = ["C", "D", "E", "F", "G", "A", "B"];
export const LETTER_INDEX: Record<Letter, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
export const LETTER_MIDI: Record<Letter, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const NATURAL_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);

const SHARP_LETTER: Record<number, Letter> = { 1: "C", 3: "D", 6: "F", 8: "G", 10: "A" };
const FLAT_LETTER: Record<number, Letter> = { 1: "D", 3: "E", 6: "G", 8: "A", 10: "B" };

/** 谱表最上一条线的音级位置（diatonic index）：高音谱=F5，低音谱=A3 */
export const STAFF_TOP: Record<Staff, number> = { treble: 38, bass: 26 };
/**
 * 两条谱表之间的间距（stave.y 之差）。大谱表按中央C分谱，边界两侧的音
 * （如低音谱 B3 与高音谱 C4）会落在两条谱表之间的空隙里，间距太小时
 * 并行和弦会把它们叠在一起，所以留出比"音高网格连续"更大的空隙。
 */
export const GRAND_STAFF_GAP = 90;
/** 大谱表在中央C处分谱：midi >= 该值记在高音谱表，否则记在低音谱表 */
export const GRAND_SPLIT = 60;

/** 一个音在（大）谱表里该记到哪一条谱表上 */
export function staffOfMidi(midi: number): Staff {
  return midi >= GRAND_SPLIT ? "treble" : "bass";
}

export const RANGES: Record<Clef, Range[]> = {
  treble: [
    { id: "c4-c6", label: "C4 – C6（中央C起两个八度）", lo: 60, hi: 84 },
    { id: "c4-c5", label: "C4 – C5（中央C起一个八度）", lo: 60, hi: 72 },
    { id: "c3-c5", label: "C3 – C5（中央C上下各一个八度）", lo: 48, hi: 72 },
    { id: "c4-c7", label: "C4 – C7（高音区扩展）", lo: 60, hi: 96 },
    { id: "c2-c6", label: "C2 – C6（含大量下加线）", lo: 36, hi: 84 },
  ],
  bass: [
    { id: "c2-c4", label: "C2 – C4（低音谱常用音域）", lo: 36, hi: 60 },
    { id: "c2-c3", label: "C2 – C3（低音区一个八度）", lo: 36, hi: 48 },
    { id: "c1-c4", label: "C1 – C4（低音区扩展）", lo: 24, hi: 60 },
    { id: "c3-c5", label: "C3 – C5（含大量上加线）", lo: 48, hi: 72 },
    { id: "c1-c5", label: "C1 – C5（全音域）", lo: 24, hi: 72 },
  ],
  grand: [
    { id: "c2-c6", label: "C2 – C6（双手常用音域）", lo: 36, hi: 84 },
    { id: "c3-c5", label: "C3 – C5（中央C附近）", lo: 48, hi: 72 },
    { id: "c1-c7", label: "C1 – C7（全音域）", lo: 24, hi: 96 },
    { id: "c2-c5", label: "C2 – C5（偏低）", lo: 36, hi: 72 },
  ],
};

export const DEFAULT_RANGE: Record<Clef, string> = { treble: "c4-c6", bass: "c2-c4", grand: "c2-c6" };

export function pcOf(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

export function octaveOf(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

export function diatonic(note: Note): number {
  return LETTER_INDEX[note.letter] + 7 * note.octave;
}

function shuffle<T>(list: T[]): T[] {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function spell(midi: number, allowAccidentals: boolean): Note {
  const pc = pcOf(midi);
  const octave = octaveOf(midi);
  const natural = LETTERS.find((l) => LETTER_MIDI[l] === pc);
  if (natural) return { midi, pc, letter: natural, acc: "", octave };
  if (!allowAccidentals) {
    // 正常流程不会走到这里（取音时已过滤），兜底用升号拼写避免崩溃
    return { midi, pc, letter: SHARP_LETTER[pc], acc: "#", octave };
  }
  const useFlat = Math.random() < 0.5;
  return {
    midi,
    pc,
    letter: useFlat ? FLAT_LETTER[pc] : SHARP_LETTER[pc],
    acc: useFlat ? "b" : "#",
    octave,
  };
}

function randomMidi(lo: number, hi: number, allowAccidentals: boolean, exclude?: number): number {
  const pool: number[] = [];
  for (let midi = lo; midi <= hi; midi++) {
    if (midi === exclude) continue;
    if (allowAccidentals || NATURAL_PCS.has(pcOf(midi))) pool.push(midi);
  }
  if (pool.length === 0) return Math.min(Math.max(lo, 60), hi);
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 某条谱表在当前设置下实际可用的音域；usable=false 表示该谱表放不下（大谱表用） */
export function staffWindow(
  range: Range,
  staff: Staff,
  clef: Clef,
): { lo: number; hi: number; usable: boolean } {
  if (clef !== "grand") return { lo: range.lo, hi: range.hi, usable: true };
  if (staff === "treble") {
    const lo = Math.max(range.lo, GRAND_SPLIT);
    return lo <= range.hi ? { lo, hi: range.hi, usable: true } : { lo: range.lo, hi: range.hi, usable: false };
  }
  const hi = Math.min(range.hi, GRAND_SPLIT);
  return hi >= range.lo ? { lo: range.lo, hi, usable: true } : { lo: range.lo, hi: range.hi, usable: false };
}

/** 音域内所有可能拼写对应的音级位置范围（决定谱表上下的留白） */
export function diatonicExtent(lo: number, hi: number): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let midi = lo; midi <= hi; midi++) {
    const pc = pcOf(midi);
    const octave = octaveOf(midi);
    if (NATURAL_PCS.has(pc)) {
      const letter = LETTERS.find((l) => LETTER_MIDI[l] === pc)!;
      const index = LETTER_INDEX[letter] + 7 * octave;
      min = Math.min(min, index);
      max = Math.max(max, index);
    } else {
      const sharp = LETTER_INDEX[SHARP_LETTER[pc]] + 7 * octave;
      const flat = LETTER_INDEX[FLAT_LETTER[pc]] + 7 * octave;
      min = Math.min(min, sharp);
      max = Math.max(max, flat);
    }
  }
  if (!Number.isFinite(min)) return { min: STAFF_TOP.treble, max: STAFF_TOP.treble };
  return { min, max };
}

function pickStaff(range: Range, clef: Clef): Staff {
  if (clef !== "grand") return clef;
  const treble = staffWindow(range, "treble", clef);
  const bass = staffWindow(range, "bass", clef);
  if (treble.usable && bass.usable) return Math.random() < 0.5 ? "treble" : "bass";
  return treble.usable ? "treble" : "bass";
}

/** 生成 1~N 个同时出现的音（音级互不相同，跨度不超过一个八度） */
export function generateChord(
  range: Range,
  clef: Clef,
  allowAccidentals: boolean,
  count: number,
  prevMidi?: number,
): Question {
  const picked = pickStaff(range, clef);
  const wanted = Math.max(1, Math.min(MAX_NOTES, Math.round(count)));
  // 大谱表的多音组允许跨谱表：整个音域内取音，渲染时按音高分到高/低音谱
  const window =
    clef === "grand" && wanted > 1 ? { lo: range.lo, hi: range.hi, usable: true } : staffWindow(range, picked, clef);
  const layout: NoteLayout = wanted === 1 || Math.random() < 0.5 ? "chord" : "sequence";
  const finish = (notes: Note[]): Question => ({
    staff: clef === "grand" ? staffOfMidi(notes[0].midi) : clef,
    notes,
    layout,
  });

  if (wanted === 1) {
    return finish([spell(randomMidi(window.lo, window.hi, allowAccidentals, prevMidi), allowAccidentals)]);
  }

  for (let attempt = 0; attempt < 80; attempt++) {
    const base = randomMidi(window.lo, window.hi, allowAccidentals);
    const top = Math.min(window.hi, base + 12);
    const byPc = new Map<number, number[]>();
    for (let midi = base; midi <= top; midi++) {
      if (!allowAccidentals && !NATURAL_PCS.has(pcOf(midi))) continue;
      const pc = pcOf(midi);
      const list = byPc.get(pc);
      if (list) list.push(midi);
      else byPc.set(pc, [midi]);
    }
    const others = shuffle([...byPc.keys()].filter((pc) => pc !== pcOf(base)));
    if (others.length < wanted - 1) continue;

    const chosen = [base, ...others.slice(0, wanted - 1)];
    const notes = chosen
      .map((midi) => {
        const list = byPc.get(pcOf(midi))!;
        return spell(list[Math.floor(Math.random() * list.length)], allowAccidentals);
      })
      .sort((a, b) => a.midi - b.midi);
    return finish(notes);
  }

  return finish([spell(randomMidi(window.lo, window.hi, allowAccidentals), allowAccidentals)]);
}

/* ---------------- 音程 ---------------- */

interface IntervalDegree {
  semitones: number;
  name: string;
}

const INTERVAL_TABLE: Record<number, IntervalDegree[]> = {
  2: [
    { semitones: 1, name: "小二度" },
    { semitones: 2, name: "大二度" },
    { semitones: 3, name: "增二度" },
  ],
  3: [
    { semitones: 2, name: "减三度" },
    { semitones: 3, name: "小三度" },
    { semitones: 4, name: "大三度" },
    { semitones: 5, name: "增三度" },
  ],
  4: [
    { semitones: 4, name: "减四度" },
    { semitones: 5, name: "纯四度" },
    { semitones: 6, name: "增四度" },
  ],
  5: [
    { semitones: 6, name: "减五度" },
    { semitones: 7, name: "纯五度" },
    { semitones: 8, name: "增五度" },
  ],
  6: [
    { semitones: 7, name: "减六度" },
    { semitones: 8, name: "小六度" },
    { semitones: 9, name: "大六度" },
    { semitones: 10, name: "增六度" },
  ],
  7: [
    { semitones: 9, name: "减七度" },
    { semitones: 10, name: "小七度" },
    { semitones: 11, name: "大七度" },
    { semitones: 12, name: "增七度" },
  ],
  8: [
    { semitones: 11, name: "减八度" },
    { semitones: 12, name: "纯八度" },
    { semitones: 13, name: "增八度" },
  ],
};

const ALL_INTERVALS: (IntervalDegree & { degree: number })[] = Object.entries(INTERVAL_TABLE).flatMap(
  ([degree, list]) => list.map((item) => ({ ...item, degree: Number(degree) })),
);
const DEGREE_BY_NAME = new Map(ALL_INTERVALS.map((item) => [item.name, item.degree]));

/** 由两个音算出音程名称（要求 upper 在 lower 之上） */
export function intervalName(lower: Note, upper: Note): string | null {
  const degree = diatonic(upper) - diatonic(lower) + 1;
  const semitones = upper.midi - lower.midi;
  return INTERVAL_TABLE[degree]?.find((item) => item.semitones === semitones)?.name ?? null;
}

/** 当前升降号设置下可能出现的音程名称，用作选项池 */
function reachableIntervalNames(allowAccidentals: boolean): string[] {
  const names = new Set<string>();
  const lowerAccs: Accidental[] = allowAccidentals ? ["", "#", "b"] : [""];
  for (let lowerLetter = 0; lowerLetter < 7; lowerLetter++) {
    for (const lowerAcc of lowerAccs) {
      const lowerMidi = (4 + 1) * 12 + LETTER_MIDI[LETTERS[lowerLetter]] + (lowerAcc === "#" ? 1 : lowerAcc === "b" ? -1 : 0);
      for (let degree = 2; degree <= 8; degree++) {
        const upperIndex = lowerLetter + degree - 1;
        const upperLetter = LETTERS[upperIndex % 7];
        const upperOctave = 4 + Math.floor(upperIndex / 7);
        const natural = (upperOctave + 1) * 12 + LETTER_MIDI[upperLetter] - lowerMidi;
        const deltas: number[] = allowAccidentals ? [-1, 0, 1] : [0];
        for (const item of INTERVAL_TABLE[degree]) {
          if (deltas.includes(item.semitones - natural)) names.add(item.name);
        }
      }
    }
  }
  return [...names];
}

export function intervalOptions(correct: string, allowAccidentals: boolean): string[] {
  const pool = reachableIntervalNames(allowAccidentals).filter((name) => name !== correct);
  const degree = DEGREE_BY_NAME.get(correct);
  const sameDegree = shuffle(pool.filter((name) => DEGREE_BY_NAME.get(name) === degree));
  const others = shuffle(pool.filter((name) => DEGREE_BY_NAME.get(name) !== degree));
  return shuffle([correct, ...sameDegree.slice(0, 2), ...others].slice(0, 4));
}

/** 生成音程题：下方音在音域内，上方音与其构成 2~8 度 */
export function generateInterval(range: Range, clef: Clef, allowAccidentals: boolean): IntervalQuestion {
  const picked = pickStaff(range, clef);
  const window = staffWindow(range, picked, clef);
  const layout: NoteLayout = Math.random() < 0.5 ? "chord" : "sequence";
  const build = (lower: Note, upper: Note, name: string): IntervalQuestion => ({
    staff: clef === "grand" ? staffOfMidi(lower.midi) : clef,
    lower,
    upper,
    name,
    notes: [lower, upper],
    layout,
  });

  for (let attempt = 0; attempt < 120; attempt++) {
    const lowerMidi = randomMidi(window.lo, window.hi, allowAccidentals);
    const lower = spell(lowerMidi, allowAccidentals);
    const degree = 2 + Math.floor(Math.random() * 7);
    const upperIndex = LETTER_INDEX[lower.letter] + degree - 1;
    const upperLetter = LETTERS[upperIndex % 7];
    const upperOctave = lower.octave + Math.floor(upperIndex / 7);
    const natural = (upperOctave + 1) * 12 + LETTER_MIDI[upperLetter] - lowerMidi;
    const targets = shuffle(INTERVAL_TABLE[degree]);

    for (const target of targets) {
      const delta = target.semitones - natural;
      if (allowAccidentals ? delta < -1 || delta > 1 : delta !== 0) continue;
      const upperMidi = lowerMidi + target.semitones;
      if (upperMidi > window.hi || upperMidi <= lowerMidi) continue;
      const upper: Note = {
        midi: upperMidi,
        pc: pcOf(upperMidi),
        letter: upperLetter,
        acc: delta === 1 ? "#" : delta === -1 ? "b" : "",
        octave: upperOctave,
      };
      const name = intervalName(lower, upper);
      if (!name) continue;
      return build(lower, upper, name);
    }
  }

  // 兜底：音域内两个音（尽量取自然音）
  const lowerMidi = randomMidi(window.lo, Math.max(window.lo, window.hi - 2), allowAccidentals);
  const lower = spell(lowerMidi, allowAccidentals);
  let upperMidi = lowerMidi + 2;
  if (!allowAccidentals) {
    const natural = [lowerMidi + 1, lowerMidi + 2, lowerMidi + 3].find(
      (midi) => midi <= window.hi && NATURAL_PCS.has(pcOf(midi)),
    );
    if (natural) upperMidi = natural;
  }
  if (upperMidi > window.hi) upperMidi = window.hi;
  const upper = spell(upperMidi, allowAccidentals);
  const name = intervalName(lower, upper) ?? "大二度";
  return build(lower, upper, name);
}

/* ---------------- 展示 ---------------- */

/** VexFlow 用的 key，例如 c#4 / eb3 */
export function vexKey(note: Note): string {
  return `${note.letter.toLowerCase()}${note.acc}/${note.octave}`;
}

export function accSymbol(acc: Accidental): string {
  if (acc === "#") return "♯";
  if (acc === "b") return "♭";
  return "";
}

/** 显示名，如 C♯4 / Db4 */
export function noteName(note: Note): string {
  return `${note.letter}${accSymbol(note.acc)}${note.octave}`;
}

const SOLFEGE: Record<Letter, string> = { C: "Do", D: "Re", E: "Mi", F: "Fa", G: "Sol", A: "La", B: "Si" };

export function solfege(note: Note): string {
  const prefix = note.acc === "#" ? "升" : note.acc === "b" ? "降" : "";
  return `${prefix}${SOLFEGE[note.letter]}`;
}

/* ---------------- 钢琴键盘 ---------------- */

export const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
export const BLACK_PCS = [1, 3, 6, 8, 10];

export const PC_NAMES: Record<number, string> = {
  0: "C",
  1: "C♯/D♭",
  2: "D",
  3: "D♯/E♭",
  4: "E",
  5: "F",
  6: "F♯/G♭",
  7: "G",
  8: "G♯/A♭",
  9: "A",
  10: "A♯/B♭",
  11: "B",
};

/** 白键快捷键 a s d f g h j，黑键 w e t y u */
export const KEY_HINTS: Record<string, number> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
};
