import type { KeyQuizScope } from "../settings";

/** 一个调号：VexFlow spec、中文调名、主音音级、大小调、升降号个数（升为正） */
export interface KeySignatureInfo {
  spec: string;
  label: string;
  rootPc: number;
  minor: boolean;
  accidentals: number;
}

/**
 * 按五度圈排列，spec 均为 VexFlow 的 addKeySignature() 合法值。
 * 大调 15 个 + 关系小调 15 个（含 7 升 / 7 降），认调号题从中抽样。
 */
export const KEY_SIGNATURES: KeySignatureInfo[] = [
  { spec: "C", label: "C大调 / a小调", rootPc: 0, minor: false, accidentals: 0 },
  { spec: "G", label: "G大调", rootPc: 7, minor: false, accidentals: 1 },
  { spec: "D", label: "D大调", rootPc: 2, minor: false, accidentals: 2 },
  { spec: "A", label: "A大调", rootPc: 9, minor: false, accidentals: 3 },
  { spec: "E", label: "E大调", rootPc: 4, minor: false, accidentals: 4 },
  { spec: "B", label: "B大调", rootPc: 11, minor: false, accidentals: 5 },
  { spec: "F#", label: "F♯大调", rootPc: 6, minor: false, accidentals: 6 },
  { spec: "C#", label: "C♯大调", rootPc: 1, minor: false, accidentals: 7 },
  { spec: "F", label: "F大调", rootPc: 5, minor: false, accidentals: -1 },
  { spec: "Bb", label: "B♭大调", rootPc: 10, minor: false, accidentals: -2 },
  { spec: "Eb", label: "E♭大调", rootPc: 3, minor: false, accidentals: -3 },
  { spec: "Ab", label: "A♭大调", rootPc: 8, minor: false, accidentals: -4 },
  { spec: "Db", label: "D♭大调", rootPc: 1, minor: false, accidentals: -5 },
  { spec: "Gb", label: "G♭大调", rootPc: 6, minor: false, accidentals: -6 },
  { spec: "Cb", label: "C♭大调", rootPc: 11, minor: false, accidentals: -7 },
  { spec: "Am", label: "a小调", rootPc: 9, minor: true, accidentals: 0 },
  { spec: "Em", label: "e小调", rootPc: 4, minor: true, accidentals: 1 },
  { spec: "Bm", label: "b小调", rootPc: 11, minor: true, accidentals: 2 },
  { spec: "F#m", label: "f♯小调", rootPc: 6, minor: true, accidentals: 3 },
  { spec: "C#m", label: "c♯小调", rootPc: 1, minor: true, accidentals: 4 },
  { spec: "G#m", label: "g♯小调", rootPc: 8, minor: true, accidentals: 5 },
  { spec: "D#m", label: "d♯小调", rootPc: 3, minor: true, accidentals: 6 },
  { spec: "A#m", label: "a♯小调", rootPc: 10, minor: true, accidentals: 7 },
  { spec: "Dm", label: "d小调", rootPc: 2, minor: true, accidentals: -1 },
  { spec: "Gm", label: "g小调", rootPc: 7, minor: true, accidentals: -2 },
  { spec: "Cm", label: "c小调", rootPc: 0, minor: true, accidentals: -3 },
  { spec: "Fm", label: "f小调", rootPc: 5, minor: true, accidentals: -4 },
  { spec: "Bbm", label: "b♭小调", rootPc: 10, minor: true, accidentals: -5 },
  { spec: "Ebm", label: "e♭小调", rootPc: 3, minor: true, accidentals: -6 },
  { spec: "Abm", label: "a♭小调", rootPc: 8, minor: true, accidentals: -7 },
];

/** C 大调 / a 小调共用一个调号，出题时归到 spec="C"，避免两个答案都算对 */
const QUIZ_POOL = KEY_SIGNATURES.filter((item) => item.spec !== "Am");

export const KEY_SIG_BY_SPEC = new Map(KEY_SIGNATURES.map((item) => [item.spec, item]));

export function keySignatureLabel(spec: string): string {
  return KEY_SIG_BY_SPEC.get(spec)?.label ?? spec;
}

export interface KeyQuestion {
  key: KeySignatureInfo;
  /** 4 个中文调名选项，顺序已打乱 */
  options: string[];
  answer: string;
}

function shuffle<T>(list: T[], rng: () => number): T[] {
  const result = [...list];
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(rng() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

/** 出一道认调号题：同大小调优先、升降号数量接近的干扰项 */
export function generateKeyQuestion(
  scope: KeyQuizScope = "both",
  rng: () => number = Math.random,
): KeyQuestion {
  const pool = QUIZ_POOL.filter(
    (item) => scope === "both" || (scope === "minor" ? item.minor : !item.minor),
  );
  const source = pool.length > 0 ? pool : QUIZ_POOL;
  const correct = source[Math.floor(rng() * source.length)];
  const others = source
    .filter((item) => item.spec !== correct.spec)
    .sort((a, b) =>
      Math.abs(a.accidentals - correct.accidentals) - Math.abs(b.accidentals - correct.accidentals),
    );
  // 从最接近的若干个里随机取 3 个，既有区分度又不至于全是远调
  const near = others.slice(0, 8);
  const distractors = shuffle(near, rng).slice(0, 3);
  const fallback = shuffle(others, rng).slice(0, 3 - distractors.length);
  return {
    key: correct,
    options: shuffle([correct, ...distractors, ...fallback].map((item) => item.label), rng),
    answer: correct.label,
  };
}

/** 从错题身份键还原一道认调号题（本组错题复习用） */
export function keyQuestionFromSpec(spec: string, rng: () => number = Math.random): KeyQuestion | null {
  const correct = KEY_SIG_BY_SPEC.get(spec);
  if (!correct || correct.spec === "Am") return null;
  const distractors = shuffle(
    QUIZ_POOL.filter((item) => item.spec !== correct.spec),
    rng,
  ).slice(0, 3);
  return {
    key: correct,
    options: shuffle([correct, ...distractors].map((item) => item.label), rng),
    answer: correct.label,
  };
}

export function keyQuestionKey(key: KeySignatureInfo): string {
  return `key:${key.spec}`;
}
