import { describe, expect, it } from "vitest";
import {
  EAR_GUIDE,
  EAR_GUIDE_TOTAL,
  KEY_HINTS,
  LETTER_INDEX,
  LETTER_MIDI,
  LETTERS,
  MAX_NOTES,
  NATURAL_PCS,
  RANGES,
  TEMPO_TERMS,
  accSymbol,
  diatonic,
  diatonicExtent,
  generateChord,
  generateEarNote,
  generateInterval,
  intervalName,
  intervalOptions,
  midiLabel,
  noteName,
  octaveGroupRoot,
  octaveOf,
  pcOf,
  shortcutMidi,
  solfege,
  staffOfMidi,
  staffWindow,
  tempoTermOf,
  vexKey,
  type Note,
  type Range,
} from "./theory";

const C4: Note = { midi: 60, pc: 0, letter: "C", acc: "", octave: 4 };
const CS4: Note = { midi: 61, pc: 1, letter: "C", acc: "#", octave: 4 };
const DB4: Note = { midi: 61, pc: 1, letter: "D", acc: "b", octave: 4 };
const E4: Note = { midi: 64, pc: 4, letter: "E", acc: "", octave: 4 };
const G4: Note = { midi: 67, pc: 7, letter: "G", acc: "", octave: 4 };
const A4: Note = { midi: 69, pc: 9, letter: "A", acc: "", octave: 4 };
const C5: Note = { midi: 72, pc: 0, letter: "C", acc: "", octave: 5 };

const RANGE_C4_C6: Range = RANGES.treble[0];

describe("基础换算", () => {
  it("pcOf 正负取模", () => {
    expect(pcOf(60)).toBe(0);
    expect(pcOf(61)).toBe(1);
    expect(pcOf(72)).toBe(0);
    expect(pcOf(-1)).toBe(11);
    expect(pcOf(-12)).toBe(0);
  });

  it("octaveOf", () => {
    expect(octaveOf(60)).toBe(4);
    expect(octaveOf(59)).toBe(3);
    expect(octaveOf(72)).toBe(5);
    expect(octaveOf(24)).toBe(1);
  });

  it("diatonic：字母序号 + 7×八度", () => {
    expect(diatonic(C4)).toBe(28);
    expect(diatonic(C5)).toBe(35);
    expect(diatonic({ ...C4, letter: "B", midi: 71, pc: 11 })).toBe(34);
  });

  it("octaveGroupRoot 对齐八度组", () => {
    expect(octaveGroupRoot(60)).toBe(60);
    expect(octaveGroupRoot(71)).toBe(60);
    expect(octaveGroupRoot(72)).toBe(72);
    expect(octaveGroupRoot(48)).toBe(48);
    expect(octaveGroupRoot(59)).toBe(48);
  });
});

describe("拼写与显示", () => {
  it("noteName / accSymbol / solfege / vexKey / midiLabel", () => {
    expect(noteName(C4)).toBe("C4");
    expect(noteName(CS4)).toBe("C♯4");
    expect(noteName(DB4)).toBe("D♭4");
    expect(accSymbol("#")).toBe("♯");
    expect(accSymbol("b")).toBe("♭");
    expect(accSymbol("")).toBe("");
    expect(solfege(C4)).toBe("Do");
    expect(solfege(CS4)).toBe("升Do");
    expect(solfege(DB4)).toBe("降Re");
    expect(vexKey(C4)).toBe("c/4");
    expect(vexKey(CS4)).toBe("c#/4");
    expect(vexKey(DB4)).toBe("db/4");
    expect(midiLabel(60)).toBe("C4");
    expect(midiLabel(61)).toBe("C♯4");
    expect(midiLabel(24)).toBe("C1");
  });

  it("每个自然音级都有字母且无重复 midi 偏移", () => {
    const seen = new Set<number>();
    for (const letter of LETTERS) {
      expect(NATURAL_PCS.has(LETTER_MIDI[letter])).toBe(true);
      expect(seen.has(LETTER_MIDI[letter])).toBe(false);
      seen.add(LETTER_MIDI[letter]);
    }
    expect(Object.keys(LETTER_INDEX).length).toBe(7);
  });
});

describe("音程", () => {
  it("自然音程名称", () => {
    expect(intervalName(C4, E4)).toBe("大三度");
    expect(intervalName(C4, G4)).toBe("纯五度");
    expect(intervalName(C4, A4)).toBe("大六度");
    expect(intervalName(C4, C5)).toBe("纯八度");
    expect(intervalName(E4, G4)).toBe("小三度");
  });

  it("升降号音程", () => {
    expect(intervalName(C4, DB4)).toBe("小二度");
    expect(intervalName(C4, { ...E4, acc: "#", midi: 65, pc: 5 })).toBe("增三度");
    expect(intervalName(C4, CS4)).toBeNull(); // 同字母是增一度，不在音程表内
  });

  it("upper 必须在 lower 之上，否则 null", () => {
    expect(intervalName(E4, C4)).toBeNull();
    expect(intervalName(C4, C4)).toBeNull();
  });

  it("intervalOptions 含正确项且不重复、恒 4 项", () => {
    for (const correct of ["大三度", "纯五度", "小七度", "增四度"]) {
      for (const allowAcc of [false, true]) {
        const options = intervalOptions(correct, allowAcc);
        expect(options).toHaveLength(4);
        expect(new Set(options).size).toBe(4);
        expect(options).toContain(correct);
      }
    }
  });

  it("generateInterval：上音在下音之上且名称可反推", () => {
    for (let i = 0; i < 200; i++) {
      const q = generateInterval(RANGE_C4_C6, "treble", i % 2 === 0);
      expect(q.lower.midi).toBeLessThan(q.upper.midi);
      expect(q.upper.midi).toBeLessThanOrEqual(RANGE_C4_C6.hi);
      expect(intervalName(q.lower, q.upper)).toBe(q.name);
      expect(q.notes).toHaveLength(2);
    }
  });

  it("generateInterval 不含升降号时全部自然音", () => {
    for (let i = 0; i < 100; i++) {
      const q = generateInterval(RANGE_C4_C6, "treble", false);
      for (const note of q.notes) {
        expect(note.acc).toBe("");
        expect(NATURAL_PCS.has(note.pc)).toBe(true);
      }
    }
  });
});

describe("出题 generateChord", () => {
  it("单音：音域内、拼写自洽", () => {
    for (let i = 0; i < 100; i++) {
      const q = generateChord(RANGE_C4_C6, "treble", false, 1);
      expect(q.notes).toHaveLength(1);
      const note = q.notes[0];
      expect(note.midi).toBeGreaterThanOrEqual(RANGE_C4_C6.lo);
      expect(note.midi).toBeLessThanOrEqual(RANGE_C4_C6.hi);
      expect(NATURAL_PCS.has(note.pc)).toBe(true);
      expect(note.pc).toBe(pcOf(note.midi));
      expect(note.octave).toBe(octaveOf(note.midi));
    }
  });

  it("多音：音级互不相同、升序、跨度 ≤ 一个八度", () => {
    for (let i = 0; i < 100; i++) {
      const count = 2 + (i % (MAX_NOTES - 1));
      const q = generateChord(RANGE_C4_C6, "treble", false, count);
      expect(q.notes.length).toBeGreaterThanOrEqual(2);
      const pcs = q.notes.map((n) => n.pc);
      expect(new Set(pcs).size).toBe(pcs.length);
      for (let k = 1; k < q.notes.length; k++) {
        expect(q.notes[k].midi).toBeGreaterThan(q.notes[k - 1].midi);
      }
      const span = q.notes[q.notes.length - 1].midi - q.notes[0].midi;
      expect(span).toBeLessThanOrEqual(12);
    }
  });

  it("prevMidi 排除上一题音高", () => {
    for (let i = 0; i < 50; i++) {
      const q = generateChord(RANGE_C4_C6, "treble", false, 1, 60);
      expect(q.notes[0].midi).not.toBe(60);
    }
  });

  it("低音谱音域内", () => {
    const bass = RANGES.bass[0];
    for (let i = 0; i < 50; i++) {
      const q = generateChord(bass, "bass", false, 1);
      expect(q.staff).toBe("bass");
      expect(q.notes[0].midi).toBeGreaterThanOrEqual(bass.lo);
      expect(q.notes[0].midi).toBeLessThanOrEqual(bass.hi);
    }
  });
});

describe("staffWindow / diatonicExtent / staffOfMidi", () => {
  it("非大谱表直接透传", () => {
    expect(staffWindow(RANGE_C4_C6, "treble", "treble")).toEqual({ lo: 60, hi: 84, usable: true });
  });

  it("大谱表按中央C分窗", () => {
    const grand = RANGES.grand[0];
    const treble = staffWindow(grand, "treble", "grand");
    const bass = staffWindow(grand, "bass", "grand");
    expect(treble.lo).toBe(60);
    expect(treble.usable).toBe(true);
    expect(bass.hi).toBe(60);
    expect(bass.usable).toBe(true);
  });

  it("diatonicExtent 覆盖自然+黑键两侧拼写", () => {
    const extent = diatonicExtent(60, 61);
    // C4=28，C♯4=29，D♭4=29 → min 28 max 29
    expect(extent.min).toBe(28);
    expect(extent.max).toBe(29);
  });

  it("staffOfMidi 在 60 分谱", () => {
    expect(staffOfMidi(60)).toBe("treble");
    expect(staffOfMidi(59)).toBe("bass");
  });
});

describe("快捷键", () => {
  it("KEY_HINTS 覆盖 12 个音级且互不冲突", () => {
    const pcs = Object.values(KEY_HINTS);
    expect(new Set(pcs).size).toBe(12);
    for (const pc of pcs) {
      expect(pc).toBeGreaterThanOrEqual(0);
      expect(pc).toBeLessThanOrEqual(11);
    }
  });

  it("shortcutMidi 优先对齐待答音八度", () => {
    expect(shortcutMidi(0, 60, 71, 60)).toBe(60);
    expect(shortcutMidi(0, 60, 71)).toBe(60);
    expect(shortcutMidi(0, 60, 71, 72)).toBe(60); // 72 超出显示区，退回组根
    expect(shortcutMidi(7, 60, 71, 67)).toBe(67);
  });
});

describe("练耳引导", () => {
  it("引导时间轴单调递增且在 TOTAL 前结束", () => {
    let prev = -1;
    for (const note of EAR_GUIDE) {
      expect(note.time).toBeGreaterThan(prev);
      expect(note.time + note.duration).toBeLessThanOrEqual(EAR_GUIDE_TOTAL + 1e-9);
      prev = note.time;
    }
  });

  it("出题音落在 C4–B4", () => {
    for (let i = 0; i < 100; i++) {
      const q = generateEarNote(false);
      const note = q.notes[0];
      expect(note.midi).toBeGreaterThanOrEqual(60);
      expect(note.midi).toBeLessThanOrEqual(71);
      expect(NATURAL_PCS.has(note.pc)).toBe(true);
    }
  });

  it("exclude 排除上一题", () => {
    for (let i = 0; i < 50; i++) {
      const q = generateEarNote(false, 60);
      expect(q.notes[0].midi).not.toBe(60);
    }
  });
});

describe("速度术语", () => {
  it("20–260 连续覆盖无空洞", () => {
    for (let bpm = 20; bpm <= 260; bpm++) {
      expect(tempoTermOf(bpm)).not.toBeNull();
    }
  });

  it("边界外返回 null", () => {
    expect(tempoTermOf(19)).toBeNull();
    expect(tempoTermOf(261)).toBeNull();
  });

  it("术语区间互不矛盾（lo < hi）", () => {
    for (const term of TEMPO_TERMS) {
      expect(term.lo).toBeLessThan(term.hi);
    }
  });

  it("常见 BPM 命中预期术语（重叠边界取偏慢者）", () => {
    expect(tempoTermOf(84)?.it).toBe("Andante");
    expect(tempoTermOf(108)?.it).toBe("Andante"); // Andante 上界与 Moderato 下界重叠
    expect(tempoTermOf(114)?.it).toBe("Moderato");
    expect(tempoTermOf(132)?.it).toBe("Allegro");
  });
});
