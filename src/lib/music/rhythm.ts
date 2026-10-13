import { LETTER_INDEX, LETTER_MIDI, pcOf, type Accidental, type Letter, type Note } from "./theory";
import { scaleOf, type ChordKey } from "./chord";

/** 时值：全 w / 二分 h / 四分 q / 八分 8 / 十六分 16 / 附点 h. q. 8. */
export type DurationId = "w" | "h" | "q" | "8" | "16" | "h." | "q." | "8.";

/** 一个时值槽：note=null 表示休止 */
export interface TimedEvent {
  note: Note | null;
  dur: DurationId;
}

/** 一句乐句：简单拍（分母恒为 4），按小节分组 */
export interface Phrase {
  meter: [number, number];
  bars: TimedEvent[][];
}

/** 支持的拍号（P1 只做简单拍） */
export const PHRASE_METERS: [number, number][] = [
  [2, 4],
  [3, 4],
  [4, 4],
];

export function meterId(meter: [number, number]): string {
  return `${meter[0]}/${meter[1]}`;
}

/** 时值折合四分音符拍数 */
export function durationBeats(dur: DurationId): number {
  switch (dur) {
    case "w":
      return 4;
    case "h":
      return 2;
    case "q":
      return 1;
    case "8":
      return 0.5;
    case "16":
      return 0.25;
    case "h.":
      return 3;
    case "q.":
      return 1.5;
    case "8.":
      return 0.75;
  }
}

export function barBeats(bar: TimedEvent[]): number {
  return bar.reduce((sum, event) => sum + durationBeats(event.dur), 0);
}

/** 按时间顺序展开全部事件（渲染与播放共用的索引） */
export function flattenEvents(phrase: Phrase): TimedEvent[] {
  return phrase.bars.flat();
}

export interface PhraseOptions {
  key: ChordKey;
  meter: [number, number];
  /** 小节数：2 或 4 */
  bars: number;
  /** 音域（MIDI 闭区间），旋律全部落在其中 */
  lo: number;
  hi: number;
}

interface ScaleDegree {
  letter: Letter;
  acc: Accidental;
  pc: number;
}

interface Pos {
  octave: number;
  degree: number;
}

/* ---------------- 音阶位置 ↔ MIDI/Note ---------------- */

function posToMidi(scale: ScaleDegree[], pos: Pos): number {
  // 主音（degree=0）在该 octave 的 MIDI，再沿音阶级进累计到达 pos.degree
  const tonic = scale[0];
  const accOffset = (entry: ScaleDegree) => (entry.acc === "#" ? 1 : entry.acc === "b" ? -1 : 0);
  let midi = (pos.octave + 1) * 12 + LETTER_MIDI[tonic.letter] + accOffset(tonic);
  for (let index = 0; index < pos.degree; index++) {
    let step = scale[index + 1].pc - scale[index].pc;
    if (step <= 0) step += 12;
    midi += step;
  }
  return midi;
}

function midiToNote(midi: number, scale: ScaleDegree[]): Note {
  const pc = pcOf(midi);
  const index = scale.findIndex((entry) => entry.pc === pc);
  const entry = scale[index >= 0 ? index : 0];
  const letterMidi = LETTER_MIDI[entry.letter] + (entry.acc === "#" ? 1 : entry.acc === "b" ? -1 : 0);
  const octave = Math.floor((midi - letterMidi) / 12) - 1;
  return { midi, pc, letter: entry.letter, acc: entry.acc, octave };
}

/** 音在音阶上的位置（字母序号 + 7×八度），用于量跳进距离 */
export function diatonicPosition(note: Note): number {
  return LETTER_INDEX[note.letter] + 7 * note.octave;
}

/* ---------------- 节奏模板 ---------------- */

const RHYTHM_POOL: Record<string, DurationId[][]> = {
  "2/4": [
    ["q", "q"],
    ["8", "8", "q"],
    ["q", "8", "8"],
    ["q.", "8"],
    ["8.", "16", "q"],
    ["16", "16", "8", "q"],
    ["8", "16", "16", "q"],
    ["8", "8", "8", "8"],
    ["q", "8.", "16"],
  ],
  "3/4": [
    ["q", "q", "q"],
    ["8", "8", "q", "q"],
    ["q", "8", "8", "q"],
    ["h", "q"],
    ["q", "h"],
    ["q.", "8", "q"],
    ["q", "q.", "8"],
    ["8.", "16", "q", "q"],
    ["16", "16", "8", "q", "q"],
    ["q", "8.", "16", "q"],
    ["8", "8", "8", "8", "q"],
    ["8", "16", "16", "q", "q"],
  ],
  "4/4": [
    ["q", "q", "q", "q"],
    ["8", "8", "q", "q", "q"],
    ["q", "q", "8", "8", "q"],
    ["q", "8", "8", "q", "q"],
    ["h", "q", "q"],
    ["q", "q", "h"],
    ["h.", "q"],
    ["q.", "8", "q", "q"],
    ["q", "q.", "8", "q"],
    ["q", "q", "q.", "8"],
    ["8.", "16", "q", "q", "q"],
    ["8", "16", "16", "q", "q", "q"],
    ["16", "16", "8", "q", "q", "q"],
    ["8", "8", "16", "16", "8", "q", "q"],
    ["8", "8", "8", "8", "q", "q"],
  ],
};

/** 末小节结构：4/4 随机 h+h休 或 h.+q休；3/4 h+q休；2/4 整小节 h */
function endingPattern(meter: [number, number]): DurationId[] {
  if (meter[0] >= 4) return Math.random() < 0.5 ? ["h", "h"] : ["h.", "q"];
  if (meter[0] === 3) return ["h", "q"];
  return ["h"];
}

const RESTABLE: ReadonlySet<DurationId> = new Set(["q", "8", "h", "h."]);

/** 在中间小节随机挖空一个可休止的槽（排除单事件条）；兜底拆成 q q 休第二个 */
function withMiddleRest(pattern: DurationId[]): { pattern: DurationId[]; restIndex: number } {
  if (pattern.length >= 2) {
    const candidates = pattern.flatMap((dur, index) => (RESTABLE.has(dur) ? [index] : []));
    if (candidates.length > 0) {
      return { pattern, restIndex: candidates[Math.floor(Math.random() * candidates.length)] };
    }
  }
  return { pattern: ["q", "q"], restIndex: 1 };
}

/* ---------------- 旋律行进 ---------------- */

function pickStartPos(scale: ScaleDegree[], lo: number, hi: number): Pos {
  const candidates: { pos: Pos; midi: number }[] = [];
  for (let octave = 1; octave <= 7; octave++) {
    for (const degree of [0, 2, 4]) {
      const pos = { octave, degree };
      const midi = posToMidi(scale, pos);
      if (midi >= lo && midi <= hi) candidates.push({ pos, midi });
    }
  }
  const mid = (lo + hi) / 2;
  candidates.sort((a, b) => Math.abs(a.midi - mid) - Math.abs(b.midi - mid));
  return candidates[0]?.pos ?? { octave: 4, degree: 0 };
}

function advance(from: Pos, dir: 1 | -1, size: number, lo: number, hi: number, scale: ScaleDegree[]): Pos | null {
  let degree = from.degree;
  let octave = from.octave;
  for (let step = 0; step < size; step++) {
    degree += dir;
    if (degree > 6) {
      degree = 0;
      octave += 1;
    }
    if (degree < 0) {
      degree = 6;
      octave -= 1;
    }
  }
  const midi = posToMidi(scale, { octave, degree });
  if (midi < lo || midi > hi) return null;
  return { octave, degree };
}

/** 步长权重：级进为主（~68%），小三度/四度为辅，不超过五度 */
function pickSize(): number {
  const roll = Math.random();
  if (roll < 0.68) return 1;
  if (roll < 0.9) return 2;
  if (roll < 0.97) return 3;
  return 4;
}

function pickDir(prevDir: 1 | -1): 1 | -1 {
  if (Math.random() < 0.55) return prevDir;
  return prevDir === 1 ? -1 : 1;
}

/**
 * 随机行走生成 count 个音阶位置：
 * - 多级进+小跳，最大纯五度（4 个音级步）
 * - 大跳（≥3 步）后强制反向级进回进（硬规则）
 * - 相邻音高不重复
 */
function walkPositions(scale: ScaleDegree[], start: Pos, count: number, lo: number, hi: number): Pos[] {
  const result: Pos[] = [start];
  let prevDir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
  let prevSize = 0;
  for (let index = 1; index < count; index++) {
    const from = result[index - 1];
    const fromMidi = posToMidi(scale, from);
    // 大跳后硬性回进；其余按权重选步长/方向
    let size = prevSize >= 3 ? 1 : pickSize();
    let dir = prevSize >= 3 ? ((-prevDir) as 1 | -1) : pickDir(prevDir);
    let placed: Pos | null = null;

    for (let attempt = 0; attempt < 10 && !placed; attempt++) {
      const candidate = advance(from, dir, size, lo, hi, scale);
      if (candidate && posToMidi(scale, candidate) !== fromMidi) {
        placed = candidate;
        prevDir = dir;
        prevSize = size;
        break;
      }
      dir = dir === 1 ? -1 : 1;
      if (size > 1) size = attempt % 2 === 0 ? Math.max(1, size - 1) : 1;
    }

    if (!placed) {
      const mid = (lo + hi) / 2;
      const toward: 1 | -1 = fromMidi < mid ? 1 : -1;
      placed = advance(from, toward, 1, lo, hi, scale) ?? from;
      prevDir = toward;
      prevSize = 1;
    }
    result.push(placed);
  }
  return result;
}

/**
 * 选末音：行进数组的最后一位会被替换，实际前一音是 positions[n-2]。
 * - 入句大跳（≥3 音级步）时只允许从实际前一音反向级进，落点须为主三和弦音
 *   （不满足返回 null 让调用方重摇）
 * - 否则从实际前一音 ≤3 步收束到主三和弦音，且与再前一音的总音程 ≤ 纯五度
 */
function chooseFinalPos(scale: ScaleDegree[], positions: Pos[], lo: number, hi: number): Pos | null {
  const lastKept = positions[positions.length - 2];
  const keptMidis = new Set(positions.slice(0, -1).map((pos) => posToMidi(scale, pos)));
  const allowed = [0, 4, 2];
  const spanOf = (a: Pos, b: Pos) => a.octave * 7 + a.degree - (b.octave * 7 + b.degree);
  const incoming = positions.length >= 3 ? spanOf(lastKept, positions[positions.length - 3]) : 0;

  if (Math.abs(incoming) >= 3) {
    const forced = advance(lastKept, incoming > 0 ? -1 : 1, 1, lo, hi, scale);
    if (!forced || !allowed.includes(forced.degree)) return null;
    if (keptMidis.has(posToMidi(scale, forced))) return null;
    return forced;
  }

  const lastKeptMidi = posToMidi(scale, lastKept);
  for (let size = 1; size <= 3; size++) {
    for (const dir of [1, -1] as const) {
      const candidate = advance(lastKept, dir, size, lo, hi, scale);
      if (!candidate) continue;
      const midi = posToMidi(scale, candidate);
      if (!allowed.includes(candidate.degree)) continue;
      if (keptMidis.has(midi) || midi === lastKeptMidi) continue;
      if (Math.abs(incoming + dir * size) > 4) continue;
      return candidate;
    }
  }
  if ([0, 2, 4].includes(lastKept.degree) && !keptMidis.has(lastKeptMidi) && Math.abs(incoming) <= 4) {
    return lastKept;
  }
  return null;
}

/* ---------------- 生成入口 ---------------- */

export function generatePhrase(options: PhraseOptions): Phrase {
  const { key, meter, lo, hi } = options;
  const bars = options.bars === 4 ? 4 : 2;
  const scale = scaleOf(key);
  const pool = RHYTHM_POOL[meterId(meter)] ?? RHYTHM_POOL["4/4"];

  const patterns: DurationId[][] = [];
  for (let index = 0; index < bars - 1; index++) {
    patterns.push([...pool[Math.floor(Math.random() * pool.length)]]);
  }

  const restBar = bars === 2 ? 0 : 1 + Math.floor(Math.random() * (bars - 2));
  const rest = withMiddleRest(patterns[restBar]);
  patterns[restBar] = rest.pattern;

  let noteCount = 1; // 末小节的收束音
  patterns.forEach((pattern, bar) => {
    pattern.forEach((_dur, slot) => {
      if (!(bar === restBar && slot === rest.restIndex)) noteCount += 1;
    });
  });

  const start = pickStartPos(scale, lo, hi);
  let positions: Pos[] | null = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    const walked = walkPositions(scale, start, noteCount, lo, hi);
    const finalPos = chooseFinalPos(scale, walked, lo, hi);
    if (finalPos) {
      walked[noteCount - 1] = finalPos;
      positions = walked;
      break;
    }
  }
  if (!positions) {
    // 兜底：直接用行进结果（极窄音域等极端情况，规则可能退化）
    positions = walkPositions(scale, start, noteCount, lo, hi);
  }

  const resultBars: TimedEvent[][] = [];
  let cursor = 0;
  patterns.forEach((pattern, bar) => {
    const events: TimedEvent[] = pattern.map((dur, slot) => {
      if (bar === restBar && slot === rest.restIndex) return { note: null, dur };
      const note = midiToNote(posToMidi(scale, positions[cursor]), scale);
      cursor += 1;
      return { note, dur };
    });
    resultBars.push(events);
  });

  const finalNote = midiToNote(posToMidi(scale, positions[cursor]), scale);
  const tailPattern = endingPattern(meter);
  const tail: TimedEvent[] = [{ note: finalNote, dur: tailPattern[0] }];
  for (let index = 1; index < tailPattern.length; index++) {
    tail.push({ note: null, dur: tailPattern[index] });
  }
  resultBars.push(tail);

  return { meter, bars: resultBars };
}
