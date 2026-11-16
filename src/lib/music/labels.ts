import {
  LETTER_INDEX,
  LETTER_MIDI,
  accSymbol,
  octaveOf,
  pcOf,
  type Letter,
  type Note,
} from "./theory";

/** 答案标记方式：音名 / 首调唱名 / 简谱数字 */
export type LabelMode = "letter" | "solfege" | "number";

const SOLFEGE: Record<Letter, string> = {
  C: "Do", D: "Re", E: "Mi", F: "Fa", G: "Sol", A: "La", B: "Si",
};
const SOLFEGE_ZH: Record<Letter, string> = {
  C: "do", D: "re", E: "mi", F: "fa", G: "sol", A: "la", B: "si",
};
const SHARP_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const LETTERS: Letter[] = ["C", "D", "E", "F", "G", "A", "B"];

export const LABEL_MODE_NAMES: Record<LabelMode, string> = {
  letter: "音名",
  solfege: "唱名",
  number: "简谱",
};

/** 固定调用法的音名（C♯4 / D♭4） */
export function letterLabel(note: Note): string {
  return `${note.letter}${accSymbol(note.acc)}${note.octave}`;
}

/** 主音字母：自然音优先；黑键主音按升号拼写取字母 */
function tonicLetter(tonicPc: number): Letter {
  const natural = LETTERS.find((letter) => LETTER_MIDI[letter] === tonicPc);
  if (natural) return natural;
  return SHARP_NAMES[tonicPc].charAt(0) as Letter;
}

/**
 * 相对主音的首调级数与升降倾向。
 * 以音符自身的音名拼写为准：F 就是 Fa，只有 E♯ 才写成升 Mi。
 * 之前只按 MIDI 音级推算，会在没开升降号时把自然音 F 误标成「升 mi」。
 */
function degreeOf(note: Note, tonicPc: number): { degree: number; accidental: "" | "#" | "b" } {
  const degree = (LETTER_INDEX[note.letter] - LETTER_INDEX[tonicLetter(tonicPc)] + 7) % 7;
  const naturalPc = (tonicPc + MAJOR_STEPS[degree]) % 12;
  let delta = (note.pc - naturalPc + 12) % 12;
  if (delta > 6) delta -= 12;
  if (delta === 1) return { degree, accidental: "#" };
  if (delta === -1) return { degree, accidental: "b" };
  return { degree, accidental: "" };
}

/** 首调唱名 / 简谱数字：升降号用「升降」或 ♯♭ 前缀 */
export function movableLabel(note: Note, mode: "solfege" | "number", tonicPc = 0): string {
  const { degree, accidental } = degreeOf(note, tonicPc);
  const prefix = accidental === "#" ? "♯" : accidental === "b" ? "♭" : "";
  if (mode === "number") return `${prefix}${degree + 1}`;
  return `${accidental === "#" ? "升" : accidental === "b" ? "降" : ""}${SOLFEGE[LETTERS[degree]]}`;
}

/** 按设置的标记方式给一个音生成显示文本 */
export function noteLabel(note: Note, mode: LabelMode, tonicPc = 0): string {
  if (mode === "letter") return letterLabel(note);
  return movableLabel(note, mode, tonicPc);
}

/** 只有 MIDI 音高时也能显示（用升号拼写） */
export function midiLabelFor(midi: number, mode: LabelMode, tonicPc = 0): string {
  const pc = pcOf(midi);
  const octave = octaveOf(midi);
  const note: Note = {
    midi,
    pc,
    letter: SHARP_NAMES[pc].charAt(0) as Letter,
    acc: SHARP_NAMES[pc].includes("♯") ? "#" : "",
    octave,
  };
  return noteLabel(note, mode, tonicPc);
}

/** 中文唱名（结果文案里「· do」这类展示） */
export function solfegeZh(note: Note, tonicPc = 0): string {
  const { degree, accidental } = degreeOf(note, tonicPc);
  const prefix = accidental === "#" ? "升" : accidental === "b" ? "降" : "";
  return `${prefix}${SOLFEGE_ZH[LETTERS[degree]]}`;
}

/** 反应时长：1.2s / 850ms */
export function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}
