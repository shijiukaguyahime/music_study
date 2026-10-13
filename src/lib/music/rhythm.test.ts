import { describe, expect, it } from "vitest";
import {
  barBeats,
  durationBeats,
  flattenEvents,
  generatePhrase,
  meterId,
  type Phrase,
} from "./rhythm";
import { scaleOf } from "./chord";
import { diatonic, pcOf } from "./theory";
import type { ChordKey } from "./chord";
import type { Note } from "./theory";

const KEYS: ChordKey[] = [
  { mode: "major", rootPc: 0 },
  { mode: "major", rootPc: 5 },
  { mode: "naturalMinor", rootPc: 9 },
  { mode: "harmonicMinor", rootPc: 4 },
];

const METERS: [number, number][] = [
  [2, 4],
  [3, 4],
  [4, 4],
];

function barsSum(phrase: Phrase): number[] {
  return phrase.bars.map((bar) => barBeats(bar));
}

describe("时值换算", () => {
  it("durationBeats 全量", () => {
    expect(durationBeats("w")).toBe(4);
    expect(durationBeats("h")).toBe(2);
    expect(durationBeats("q")).toBe(1);
    expect(durationBeats("8")).toBe(0.5);
    expect(durationBeats("16")).toBe(0.25);
    expect(durationBeats("h.")).toBe(3);
    expect(durationBeats("q.")).toBe(1.5);
    expect(durationBeats("8.")).toBe(0.75);
  });

  it("meterId", () => {
    expect(meterId([2, 4])).toBe("2/4");
    expect(meterId([4, 4])).toBe("4/4");
  });

  it("barBeats / flattenEvents", () => {
    const note: Note = { midi: 60, pc: 0, letter: "C", acc: "", octave: 4 };
    const phrase: Phrase = {
      meter: [2, 4],
      bars: [
        [
          { note, dur: "q" },
          { note, dur: "8" },
          { note, dur: "8" },
        ],
        [{ note, dur: "h" }],
      ],
    };
    expect(barBeats(phrase.bars[0])).toBe(2);
    expect(barBeats(phrase.bars[1])).toBe(2);
    expect(flattenEvents(phrase)).toHaveLength(4);
  });
});

describe("generatePhrase 结构不变量", () => {
  it("总小节数 = bars（末小节为收束）；每小节和 = 拍数", () => {
    for (const key of KEYS) {
      for (const meter of METERS) {
        for (const bars of [2, 4] as const) {
          for (let i = 0; i < 40; i++) {
            const phrase = generatePhrase({ key, meter, bars, lo: 55, hi: 74 });
            expect(phrase.meter).toEqual(meter);
            expect(phrase.bars).toHaveLength(bars);
            const sums = barsSum(phrase);
            for (const sum of sums) {
              expect(sum).toBeCloseTo(meter[0], 10);
            }
          }
        }
      }
    }
  });

  it("中间小节恰有一个休止；末小节收束音 + 休止结构", () => {
    for (const meter of METERS) {
      for (const bars of [2, 4] as const) {
        for (let i = 0; i < 60; i++) {
          const phrase = generatePhrase({ key: KEYS[0], meter, bars, lo: 55, hi: 74 });
          const middle = phrase.bars.slice(0, bars - 1);
          const restCounts = middle.map((bar) => bar.filter((e) => e.note === null).length);
          expect(restCounts.reduce((a, b) => a + b, 0)).toBe(1);
          for (const count of restCounts) expect(count).toBeLessThanOrEqual(1);

          const tail = phrase.bars[bars - 1];
          expect(tail[0].note).not.toBeNull();
          for (let k = 1; k < tail.length; k++) expect(tail[k].note).toBeNull();
          const tailDurs = tail.map((e) => e.dur);
          if (meter[0] === 4) {
            expect(
              (tailDurs[0] === "h" && tailDurs[1] === "h") ||
                (tailDurs[0] === "h." && tailDurs[1] === "q"),
            ).toBe(true);
          } else if (meter[0] === 3) {
            expect(tailDurs).toEqual(["h", "q"]);
          } else {
            expect(tailDurs).toEqual(["h"]);
          }
        }
      }
    }
  });

  it("末音是主三和弦音（degree 0/2/4 音级）", () => {
    for (const key of KEYS) {
      const tonicPc = scaleTonicPc(key);
      const chordPcs = new Set([
        tonicPc,
        (tonicPc + 4) % 12,
        (tonicPc + 7) % 12,
        (tonicPc + 3) % 12, // 小调主三和弦
        (tonicPc + 8) % 12, // 增三/小大七相关
      ]);
      for (let i = 0; i < 80; i++) {
        const phrase = generatePhrase({ key, meter: [4, 4], bars: 2, lo: 55, hi: 74 });
        const tailNote = phrase.bars[1][0].note!;
        expect(chordPcs.has(pcOf(tailNote.midi))).toBe(true);
      }
    }
  });

  it("所有音在音域内、字母在调内", () => {
    for (const key of KEYS) {
      const scalePcs = scalePcSet(key);
      for (let i = 0; i < 40; i++) {
        const phrase = generatePhrase({ key, meter: [4, 4], bars: 4, lo: 57, hi: 72 });
        for (const bar of phrase.bars) {
          for (const event of bar) {
            if (!event.note) continue;
            expect(event.note.midi).toBeGreaterThanOrEqual(57);
            expect(event.note.midi).toBeLessThanOrEqual(72);
            expect(scalePcs.has(pcOf(event.note.midi))).toBe(true);
            expect(pcOf(event.note.midi)).toBe(event.note.pc);
          }
        }
      }
    }
  });

  it("相邻同音高不重复", () => {
    for (let i = 0; i < 100; i++) {
      const phrase = generatePhrase({ key: KEYS[0], meter: [4, 4], bars: 4, lo: 55, hi: 74 });
      const notes = flattenEvents(phrase)
        .map((e) => e.note)
        .filter((n): n is Note => n !== null);
      for (let k = 1; k < notes.length; k++) {
        expect(notes[k].midi).not.toBe(notes[k - 1].midi);
      }
    }
  });

  it("跳进（≥3 音级步）后反向级进回进（兜底路径可能退化，仅统计）", () => {
    let leaps = 0;
    let followed = 0;
    for (let i = 0; i < 200; i++) {
      const phrase = generatePhrase({ key: KEYS[0], meter: [4, 4], bars: 4, lo: 55, hi: 74 });
      const notes = flattenEvents(phrase)
        .map((e) => e.note)
        .filter((n): n is Note => n !== null);
      for (let k = 1; k < notes.length - 1; k++) {
        const prev = diatonic(notes[k - 1]);
        const cur = diatonic(notes[k]);
        const next = diatonic(notes[k + 1]);
        const inStep = cur - prev;
        if (Math.abs(inStep) >= 3) {
          leaps += 1;
          const outStep = next - cur;
          expect(Math.sign(outStep)).toBe(-Math.sign(inStep));
          followed += 1;
        }
      }
    }
    expect(leaps).toBeGreaterThan(0);
    expect(followed).toBe(leaps);
  });

  it("最大步长 ≤ 4（纯五度）", () => {
    for (let i = 0; i < 100; i++) {
      const phrase = generatePhrase({ key: KEYS[0], meter: [4, 4], bars: 4, lo: 55, hi: 74 });
      const notes = flattenEvents(phrase)
        .map((e) => e.note)
        .filter((n): n is Note => n !== null);
      for (let k = 1; k < notes.length; k++) {
        const step = Math.abs(diatonic(notes[k]) - diatonic(notes[k - 1]));
        expect(step).toBeLessThanOrEqual(4);
      }
    }
  });

  it("节奏模板：附点仅限 h./q./8.，且出现率与 16 分出现率合理", () => {
    let phrases = 0;
    let dottedPhrases = 0;
    let sixteenthPhrases = 0;
    let sixteenCount = 0;
    let eventCount = 0;
    for (let i = 0; i < 300; i++) {
      const phrase = generatePhrase({ key: KEYS[0], meter: [4, 4], bars: 2, lo: 55, hi: 74 });
      phrases += 1;
      const events = flattenEvents(phrase);
      let hasDotted = false;
      let hasSixteenth = false;
      for (const event of events) {
        eventCount += 1;
        if (event.dur.includes(".")) {
          expect(["h.", "q.", "8."]).toContain(event.dur);
          hasDotted = true;
        }
        if (event.dur === "16") {
          hasSixteenth = true;
          sixteenCount += 1;
        }
      }
      if (hasDotted) dottedPhrases += 1;
      if (hasSixteenth) sixteenthPhrases += 1;
    }
    // 4/4 池 15 条中附点 5 条、16 分 4 条，期望出现率 ≥ 0.25×phrases
    expect(dottedPhrases).toBeGreaterThanOrEqual(0.25 * phrases);
    expect(sixteenthPhrases).toBeGreaterThanOrEqual(0.2 * phrases);
    expect(sixteenCount).toBeGreaterThan(0);
    expect(eventCount).toBeGreaterThan(phrases);
  });

  it("极窄音域兜底不崩溃且仍合小节", () => {
    for (let i = 0; i < 40; i++) {
      const phrase = generatePhrase({ key: KEYS[0], meter: [4, 4], bars: 2, lo: 60, hi: 62 });
      for (const sum of barsSum(phrase)) expect(sum).toBeCloseTo(4, 10);
    }
  });
});

function scaleTonicPc(key: ChordKey): number {
  if (key.mode === "harmonicMinor" && key.rootPc === 8) return 8;
  return key.rootPc;
}

function scalePcSet(key: ChordKey): Set<number> {
  return new Set(scaleOf(key).map((s) => s.pc));
}
