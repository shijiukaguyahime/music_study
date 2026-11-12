import type { MeterId } from "../settings";
import { noteOf, pcOf, type Note } from "./theory";
import {
  RHYTHM_POOL,
  barBeats,
  durationBeats,
  type DurationId,
  type Phrase,
  type TimedEvent,
} from "./rhythm";

/** 视奏题：一小节短旋律，按时间窗逐音判定音高 + 节奏 */
export interface SightReadNote {
  note: Note;
  midi: number;
  /** 相对「旋律开始」的秒数（不含预备拍） */
  onsetSec: number;
  durationSec: number;
}

export interface SightReadQuestion {
  phrase: Phrase;
  notes: SightReadNote[];
  totalSec: number;
  meter: MeterId;
  bpm: number;
  durs: DurationId[];
}

/** C 大调 / a 小调自然音级，视奏先不引入临时升降号 */
const C_MAJOR_PCS = [0, 2, 4, 5, 7, 9, 11];
const LO = 60;
const HI = 72;

function inScale(midi: number): boolean {
  return C_MAJOR_PCS.includes(pcOf(midi));
}

function scaleStep(midi: number, step: number): number {
  let cursor = midi;
  const dir = step >= 0 ? 1 : -1;
  for (let index = 0; index < Math.abs(step); index++) {
    do {
      cursor += dir;
    } while (cursor >= LO && cursor <= HI && !inScale(cursor));
    if (cursor < LO || cursor > HI) return dir > 0 ? 60 : 72;
  }
  return Math.min(HI, Math.max(LO, cursor));
}

function pickPattern(meter: MeterId, rng: () => number): DurationId[] {
  const pool = RHYTHM_POOL[meter] ?? RHYTHM_POOL["4/4"];
  const usable = pool.filter((durs) => durs.length >= 4 && durs.length <= 8);
  const source = usable.length > 0 ? usable : pool;
  return [...source[Math.floor(rng() * source.length)]];
}

/** 生成一小节视奏旋律；bpm 决定每个音的时间窗，谱面与判定共用这套时间轴 */
export function generateSightRead(
  meter: MeterId,
  bpm: number,
  rng: () => number = Math.random,
  forcedDurs?: DurationId[],
): SightReadQuestion {
  const tempo = Math.min(260, Math.max(30, bpm));
  const spb = 60 / tempo;
  const durs = forcedDurs && forcedDurs.length > 0 ? [...forcedDurs] : pickPattern(meter, rng);
  const beats = Number(meter.split("/")[0]) || 4;

  let cursorMidi = 60 + C_MAJOR_PCS[Math.floor(rng() * 5)];
  const notes: SightReadNote[] = [];
  const events: TimedEvent[] = [];
  let cursorSec = 0;

  for (const dur of durs) {
    const stepRoll = rng();
    const step = stepRoll < 0.7 ? (rng() < 0.5 ? 1 : -1) : stepRoll < 0.92 ? (rng() < 0.5 ? 2 : -2) : 0;
    if (step !== 0) cursorMidi = scaleStep(cursorMidi, step);
    const note = noteOf(cursorMidi);
    const durationSec = durationBeats(dur) * spb;
    notes.push({ note, midi: cursorMidi, onsetSec: cursorSec, durationSec });
    events.push({ note, dur });
    cursorSec += durationSec;
  }

  const phrase: Phrase = { meter: [beats, 4], bars: [events] };
  return {
    phrase,
    notes,
    totalSec: barBeats(events) * spb,
    meter,
    bpm: tempo,
    durs,
  };
}

/** 稳定身份键：视奏按「拍号 + 节奏型」记账，旋律走向不参与 */
export function sightReadKey(question: SightReadQuestion): string {
  return `sightread:${question.meter}:${question.durs.join(",")}`;
}

/** 判定时间窗：每个音允许 ± 半拍（相邻八分音符不会互相吞掉） */
export function hitWindowSec(bpm: number): number {
  return 60 / Math.min(260, Math.max(30, bpm)) / 2;
}
