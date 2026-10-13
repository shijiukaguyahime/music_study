import { describe, expect, it } from "vitest";
import {
  CHORD_QUALITIES,
  chordKeyLabel,
  chordPromptDesc,
  chordAnswerText,
  chordRootLabels,
  degreePool,
  generateChordQuestion,
  inversionZh,
  qualityOf,
  qualityPool,
  rotateIntervals,
  sampleOptions,
  scaleOf,
  type ChordKey,
  type ChordModeId,
  type ChordQualityId,
} from "./chord";
import { pcOf } from "./theory";

const ALL_KEYS: ChordKey[] = ([] as ChordKey[]).concat(
  (["major", "naturalMinor", "harmonicMinor"] as ChordModeId[]).flatMap((mode) =>
    Array.from({ length: 12 }, (_, rootPc) => ({ mode, rootPc })),
  ),
);

const RANGE = { id: "c3-c5", label: "C3-C5", lo: 48, hi: 72 };

describe("调与音阶", () => {
  it("C 大调音阶为纯自然音 C D E F G A B", () => {
    const scale = scaleOf({ mode: "major", rootPc: 0 });
    expect(scale.map((s) => s.letter)).toEqual(["C", "D", "E", "F", "G", "A", "B"]);
    for (const entry of scale) expect(entry.acc).toBe("");
    expect(scale.map((s) => s.pc)).toEqual([0, 2, 4, 5, 7, 9, 11]);
  });

  it("a 小调自然音阶无升降", () => {
    const scale = scaleOf({ mode: "naturalMinor", rootPc: 9 });
    expect(scale.map((s) => s.letter)).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
    for (const entry of scale) expect(entry.acc).toBe("");
  });

  it("a 和声小调第 7 级升高为 G♯", () => {
    const scale = scaleOf({ mode: "harmonicMinor", rootPc: 9 });
    expect(scale[6]).toEqual({ letter: "G", acc: "#", pc: 8 });
  });

  it("e 小调（1 升）与降 B 大调（2 降）拼写正确", () => {
    const eMinor = scaleOf({ mode: "naturalMinor", rootPc: 4 });
    expect(eMinor[1]).toEqual({ letter: "F", acc: "#", pc: 6 });
    expect(eMinor[2]).toEqual({ letter: "G", acc: "", pc: 7 });
    const bbMajor = scaleOf({ mode: "major", rootPc: 10 });
    expect(bbMajor[0]).toEqual({ letter: "B", acc: "b", pc: 10 });
    expect(bbMajor[3]).toEqual({ letter: "E", acc: "b", pc: 3 });
  });

  it("36 个调的音阶：7 个音、字母各不相同、pc 互不相同", () => {
    for (const key of ALL_KEYS) {
      const scale = scaleOf(key);
      expect(scale).toHaveLength(7);
      expect(new Set(scale.map((s) => s.letter)).size).toBe(7);
      expect(new Set(scale.map((s) => s.pc)).size).toBe(7);
    }
  });

  it("G♯ 和声小调改用等音 A♭ 小调避免双升", () => {
    const label = chordKeyLabel({ mode: "harmonicMinor", rootPc: 8 });
    expect(label).toBe("A♭和声小调");
  });

  it("chordKeyLabel / chordRootLabels", () => {
    expect(chordKeyLabel({ mode: "major", rootPc: 0 })).toBe("C大调");
    expect(chordKeyLabel({ mode: "naturalMinor", rootPc: 9 })).toBe("A自然小调");
    const majorLabels = chordRootLabels("major");
    expect(majorLabels).toHaveLength(12);
    expect(majorLabels[0]).toBe("C");
    expect(majorLabels[6]).toBe("F♯");
    expect(majorLabels[1]).toBe("D♭");
  });
});

describe("性质表", () => {
  it("10 个性质、4 三和弦 + 6 七和弦", () => {
    expect(CHORD_QUALITIES).toHaveLength(10);
    expect(qualityPool(false)).toEqual(["maj", "min", "dim", "aug"]);
    expect(qualityPool(true)).toEqual(["maj7", "dom7", "m7", "m7b5", "dim7", "mMaj7"]);
  });

  it("三和弦 / 七和弦音程集合正确", () => {
    expect(qualityOf("maj").intervals).toEqual([0, 4, 7]);
    expect(qualityOf("min").intervals).toEqual([0, 3, 7]);
    expect(qualityOf("dim").intervals).toEqual([0, 3, 6]);
    expect(qualityOf("aug").intervals).toEqual([0, 4, 8]);
    expect(qualityOf("dom7").intervals).toEqual([0, 4, 7, 10]);
    expect(qualityOf("dim7").intervals).toEqual([0, 3, 6, 9]);
    expect(qualityOf("m7b5").intervals).toEqual([0, 3, 6, 10]);
    expect(qualityOf("mMaj7").intervals).toEqual([0, 3, 7, 11]); // 小三和弦 + 大七度
  });
});

describe("rotateIntervals", () => {
  it("第一转位 [0,4,7] → [0,3,8]", () => {
    expect(rotateIntervals([0, 4, 7], 1)).toEqual([0, 3, 8]);
  });

  it("第二转位 [0,4,7] → [0,5,9]（G-C-E）", () => {
    expect(rotateIntervals([0, 4, 7], 2)).toEqual([0, 5, 9]);
  });

  it("七和弦第一转位 [0,4,7,11] → [0,3,7,8]（E-G-B-C）", () => {
    expect(rotateIntervals([0, 4, 7, 11], 1)).toEqual([0, 3, 7, 8]);
  });

  it("旋转后首元素恒为 0、长度不变", () => {
    for (const quality of CHORD_QUALITIES) {
      for (let inv = 0; inv < quality.intervals.length; inv++) {
        const rotated = rotateIntervals(quality.intervals, inv);
        expect(rotated[0]).toBe(0);
        expect(rotated).toHaveLength(quality.intervals.length);
      }
    }
  });
});

describe("级数池", () => {
  it("C 大调三和弦无转位：7 个级数", () => {
    const pool = degreePool({ mode: "major", rootPc: 0 }, false, false);
    expect(pool).toEqual(["I", "ii", "iii", "IV", "V", "vi", "vii°"]);
  });

  it("C 大调三和弦带转位：7×3 = 21", () => {
    const pool = degreePool({ mode: "major", rootPc: 0 }, false, true);
    expect(pool).toHaveLength(21);
    expect(pool).toContain("I6");
    expect(pool).toContain("V64");
  });

  it("C 大调七和弦带转位：含 Imaj7、V7、viiø65", () => {
    const pool = degreePool({ mode: "major", rootPc: 0 }, true, true);
    expect(pool).toHaveLength(28);
    expect(pool).toContain("Imaj7");
    expect(pool).toContain("V7");
    expect(pool).toContain("V65");
    expect(pool).toContain("viiø65");
  });

  it("和声小调七和弦不含 III（maj7♯5 跳过题面，池仍含三和弦）", () => {
    const seventhPool = degreePool({ mode: "harmonicMinor", rootPc: 9 }, true, false);
    expect(seventhPool).not.toContain("III7");
    expect(seventhPool).toContain("i(maj7)");
    expect(seventhPool).toContain("V7");
    expect(seventhPool).toContain("vii°7");
  });

  it("inversionZh", () => {
    expect(inversionZh(0)).toBe("");
    expect(inversionZh(1)).toBe("第一转位");
    expect(inversionZh(3)).toBe("第三转位");
  });
});

describe("generateChordQuestion", () => {
  const modes: ChordModeId[] = ["major", "naturalMinor", "harmonicMinor"];

  it("调内题：音符数 = 性质音数，半音集合 = 旋转后的性质音程", () => {
    for (const mode of modes) {
      for (let rootPc = 0; rootPc < 12; rootPc++) {
        const key = { mode, rootPc };
        for (let i = 0; i < 12; i++) {
          const q = generateChordQuestion({
            diatonic: true,
            key,
            scope: i % 2 === 0 ? "triad" : "seventh",
            allowInversions: i % 3 !== 0,
            range: RANGE,
            clef: "treble",
          });
          expect(q.key).toEqual(key);
          expect(q.degree).not.toBeNull();
          expect(q.notes[0].midi).toBeGreaterThanOrEqual(RANGE.lo);
          const quality = qualityOf(q.quality);
          const rotated = rotateIntervals(quality.intervals, q.inversion);
          expect(q.notes).toHaveLength(quality.intervals.length);
          for (let k = 1; k < q.notes.length; k++) {
            expect(q.notes[k].midi).toBeGreaterThan(q.notes[k - 1].midi);
          }
          const midis = q.notes.map((n) => n.midi);
          const expected = rotated.map((r) => midis[0] + r);
          expect(midis).toEqual(expected);
        }
      }
    }
  });

  it("调内题所有音的 pc 都在音阶音级上", () => {
    const key: ChordKey = { mode: "major", rootPc: 0 };
    const scale = scaleOf(key);
    const scalePcs = new Set(scale.map((s) => s.pc));
    const scaleLetters = new Set(scale.map((s) => s.letter));
    for (let i = 0; i < 50; i++) {
      const q = generateChordQuestion({
        diatonic: true,
        key,
        scope: "both",
        allowInversions: true,
        range: RANGE,
        clef: "treble",
      });
      for (const note of q.notes) {
        expect(scalePcs.has(pcOf(note.midi))).toBe(true);
        expect(scaleLetters.has(note.letter)).toBe(true);
      }
    }
  });

  it("和声小调七和弦题不含 III 级", () => {
    const key: ChordKey = { mode: "harmonicMinor", rootPc: 9 };
    for (let i = 0; i < 80; i++) {
      const q = generateChordQuestion({
        diatonic: true,
        key,
        scope: "seventh",
        allowInversions: true,
        range: RANGE,
        clef: "treble",
      });
      expect(q.degree).not.toMatch(/^III/);
    }
  });

  it("任意题（非调内）：key/degree 为 null，symbol 含根音名", () => {
    for (let i = 0; i < 60; i++) {
      const q = generateChordQuestion({
        diatonic: false,
        key: { mode: "major", rootPc: 0 },
        scope: "both",
        allowInversions: false,
        range: RANGE,
        clef: "treble",
      });
      expect(q.key).toBeNull();
      expect(q.degree).toBeNull();
      expect(q.inversion).toBe(0);
      expect(q.symbol).toMatch(/^[A-G][♯♭]?/);
      expect(q.inversionName).toBe("");
    }
  });

  it("scope=triad 恒三和弦、seventh 恒七和弦", () => {
    for (let i = 0; i < 40; i++) {
      const triad = generateChordQuestion({
        diatonic: true,
        key: { mode: "major", rootPc: 0 },
        scope: "triad",
        allowInversions: false,
        range: RANGE,
        clef: "treble",
      });
      expect(triad.isSeventh).toBe(false);
      expect(triad.notes).toHaveLength(3);
      const seventh = generateChordQuestion({
        diatonic: true,
        key: { mode: "major", rootPc: 0 },
        scope: "seventh",
        allowInversions: false,
        range: RANGE,
        clef: "treble",
      });
      expect(seventh.isSeventh).toBe(true);
      expect(seventh.notes).toHaveLength(4);
    }
  });

  it("grand 谱表：低音决定 staff", () => {
    for (let i = 0; i < 30; i++) {
      const q = generateChordQuestion({
        diatonic: false,
        key: { mode: "major", rootPc: 0 },
        scope: "triad",
        allowInversions: false,
        range: { id: "c2-c6", label: "C2-C6", lo: 36, hi: 84 },
        clef: "grand",
      });
      const expectStaff = q.notes[0].midi >= 60 ? "treble" : "bass";
      expect(q.staff).toBe(expectStaff);
    }
  });
});

describe("提示与答案文本", () => {
  it("调内题提示含调名与级数", () => {
    const q = generateChordQuestion({
      diatonic: true,
      key: { mode: "major", rootPc: 0 },
      scope: "triad",
      allowInversions: false,
      range: RANGE,
      clef: "treble",
    });
    expect(chordPromptDesc(q)).toContain("C大调");
    expect(chordAnswerText(q)).toContain("C大调");
    expect(chordAnswerText(q)).toContain(q.symbol);
  });

  it("任意题提示含性质中文名", () => {
    const q = generateChordQuestion({
      diatonic: false,
      key: { mode: "major", rootPc: 0 },
      scope: "triad",
      allowInversions: false,
      range: RANGE,
      clef: "treble",
    });
    expect(chordPromptDesc(q)).toBe(qualityOf(q.quality).zh);
    expect(chordAnswerText(q)).toContain(q.symbol);
  });
});

describe("sampleOptions", () => {
  it("正确项 + 3 干扰、共 4 个不重复", () => {
    const pool: ChordQualityId[] = ["maj", "min", "dim", "aug", "maj7"];
    for (let i = 0; i < 100; i++) {
      const options = sampleOptions("maj", pool);
      expect(options).toHaveLength(4);
      expect(new Set(options).size).toBe(4);
      expect(options).toContain("maj");
      for (const option of options) expect(pool).toContain(option);
    }
  });
});
