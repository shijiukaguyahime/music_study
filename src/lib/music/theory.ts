export type Clef = "treble" | "bass";
export type Letter = "C" | "D" | "E" | "F" | "G" | "A" | "B";

export interface Note {
  /** MIDI 音高（唯一真实值，答题只看它） */
  midi: number;
  /** 音级 0-11，C=0 */
  pc: number;
  letter: Letter;
  acc: "" | "#" | "b";
  octave: number;
}

export interface Range {
  id: string;
  label: string;
  lo: number;
  hi: number;
}

export const NATURAL_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);

const LETTER_MIDI: Record<Letter, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NATURAL_LETTERS: Letter[] = ["C", "D", "E", "F", "G", "A", "B"];
const SHARP_LETTER: Record<number, Letter> = { 1: "C", 3: "D", 6: "F", 8: "G", 10: "A" };
const FLAT_LETTER: Record<number, Letter> = { 1: "D", 3: "E", 6: "G", 8: "A", 10: "B" };

export const RANGES: Record<Clef, Range[]> = {
  treble: [
    { id: "c4-c6", label: "C4 – C6（中央C起两个八度）", lo: 60, hi: 84 },
    { id: "c4-c5", label: "C4 – C5（中央C起一个八度）", lo: 60, hi: 72 },
    { id: "c3-c5", label: "C3 – C5（中央C上下各一个八度）", lo: 48, hi: 72 },
    { id: "g3-a5", label: "G3 – A5（高音谱常用音域）", lo: 55, hi: 81 },
  ],
  bass: [
    { id: "c2-c4", label: "C2 – C4（低音谱常用音域）", lo: 36, hi: 60 },
    { id: "c2-c3", label: "C2 – C3（低音区一个八度）", lo: 36, hi: 48 },
    { id: "c3-c5", label: "C3 – C5（含上加线）", lo: 48, hi: 72 },
    { id: "e2-d4", label: "E2 – D4", lo: 40, hi: 62 },
  ],
};

export const DEFAULT_RANGE: Record<Clef, string> = { treble: "c4-c6", bass: "c2-c4" };

export function pcOf(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

export function octaveOf(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

function spell(midi: number, allowAccidentals: boolean): Note {
  const pc = pcOf(midi);
  const octave = octaveOf(midi);
  if (NATURAL_PCS.has(pc)) {
    const letter = NATURAL_LETTERS.find((l) => LETTER_MIDI[l] === pc)!;
    return { midi, pc, letter, acc: "", octave };
  }
  if (!allowAccidentals) {
    const letter = NATURAL_LETTERS.find((l) => LETTER_MIDI[l] === pc)!;
    return { midi, pc, letter, acc: "", octave };
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

export function generateNote(range: Range, allowAccidentals: boolean, prevMidi?: number): Note {
  const pool: number[] = [];
  for (let m = range.lo; m <= range.hi; m++) {
    if (allowAccidentals || NATURAL_PCS.has(pcOf(m))) pool.push(m);
  }
  let midi = pool[Math.floor(Math.random() * pool.length)];
  if (pool.length > 1 && prevMidi !== undefined) {
    for (let i = 0; i < 6 && midi === prevMidi; i++) {
      midi = pool[Math.floor(Math.random() * pool.length)];
    }
  }
  return spell(midi, allowAccidentals);
}

/** VexFlow 用的 key，例如 c#4 / eb3 */
export function vexKey(note: Note): string {
  return `${note.letter.toLowerCase()}${note.acc}/${note.octave}`;
}

export function accSymbol(acc: Note["acc"]): string {
  if (acc === "#") return "♯";
  if (acc === "b") return "♭";
  return "";
}

/** 显示名，如 C♯4 / Db4 */
export function noteName(note: Note): string {
  return `${note.letter}${accSymbol(note.acc)}${note.octave}`;
}

const SOLFEGE: Record<Letter, string> = {
  C: "Do",
  D: "Re",
  E: "Mi",
  F: "Fa",
  G: "Sol",
  A: "La",
  B: "Si",
};

export function solfege(note: Note): string {
  const prefix = note.acc === "#" ? "升" : note.acc === "b" ? "降" : "";
  return `${prefix}${SOLFEGE[note.letter]}`;
}

/** 钢琴键（12 个音）的展示标签 */
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
