import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../settings";
import { EMPTY_PROGRESS, recordAnswer } from "../progress";
import { generateRound, roundFromKey } from "../quiz";
import {
  KEY_SIGNATURES,
  generateKeyQuestion,
  keyQuestionFromSpec,
  keyQuestionKey,
  keySignatureLabel,
} from "./keySignature";
import {
  generateRhythmQuestion,
  patternKey,
  rhythmPatternFromKey,
  rhythmQuestionFor,
  rhythmTimeline,
} from "./rhythmQuiz";
import { generateSightRead, hitWindowSec, sightReadKey } from "./sightread";
import { durationBeats } from "./rhythm";

const fixed = () => 0.37;

describe("认调号题", () => {
  it("五度圈表覆盖 7 升到 7 降，且 spec 唯一", () => {
    const specs = KEY_SIGNATURES.map((item) => item.spec);
    expect(new Set(specs).size).toBe(specs.length);
    expect(Math.max(...KEY_SIGNATURES.map((item) => item.accidentals))).toBe(7);
    expect(Math.min(...KEY_SIGNATURES.map((item) => item.accidentals))).toBe(-7);
    expect(keySignatureLabel("Bb")).toBe("B♭大调");
  });

  it("四个不重复选项且一定包含正确答案", () => {
    for (const scope of ["major", "minor", "both"] as const) {
      for (let index = 0; index < 20; index++) {
        const question = generateKeyQuestion(scope);
        expect(question.options).toHaveLength(4);
        expect(new Set(question.options).size).toBe(4);
        expect(question.options).toContain(question.answer);
        // C 大调与 a 小调共用一个调号，标签写成「C大调 / a小调」
        if (scope === "minor") expect(question.answer).toContain("小调");
        if (scope === "major") expect(question.answer).toContain("大调");
      }
    }
  });

  it("身份键可以还原成同一道题", () => {
    const restored = keyQuestionFromSpec("G", fixed);
    expect(restored).not.toBeNull();
    expect(restored?.answer).toBe(keySignatureLabel("G"));
    expect(restored?.options).toContain(restored?.answer);
    expect(keyQuestionKey(restored!.key)).toBe("key:G");
    expect(keyQuestionFromSpec("不存在的调", fixed)).toBeNull();
  });
});

describe("节奏题", () => {
  it("同拍号四个选项、包含正确项", () => {
    const question = generateRhythmQuestion("4/4", fixed);
    expect(question.options).toHaveLength(4);
    expect(new Set(question.options.map((item) => item.id)).size).toBe(4);
    expect(question.options.map((item) => item.id)).toContain(question.pattern.id);
    question.options.forEach((item) => expect(item.meter).toBe("4/4"));
  });

  it("身份键可还原，且还原题的正确项就是那道题", () => {
    const original = generateRhythmQuestion("3/4", fixed);
    const key = patternKey(original.pattern);
    const pattern = rhythmPatternFromKey(key);
    expect(pattern).not.toBeNull();
    const restored = rhythmQuestionFor(pattern!, fixed);
    expect(patternKey(restored.pattern)).toBe(key);
    expect(restored.options.map((item) => item.id)).toContain(pattern!.id);
    expect(rhythmPatternFromKey("rhythm:4/4:bogus")).toBeNull();
  });

  it("时间轴的起点与总时长按时值累加", () => {
    const pattern = generateRhythmQuestion("4/4", fixed).pattern;
    const bpm = 120;
    const spb = 60 / bpm;
    const { onsets, totalSec } = rhythmTimeline(pattern, bpm);
    expect(onsets).toHaveLength(pattern.durs.length);
    expect(onsets[0]).toBe(0);
    const beats = pattern.durs.reduce((sum, dur) => sum + durationBeats(dur), 0);
    expect(totalSec).toBeCloseTo(beats * spb);
    for (let index = 1; index < onsets.length; index++) {
      expect(onsets[index]).toBeGreaterThan(onsets[index - 1]);
    }
  });
});

describe("视奏题", () => {
  it("每个节奏槽对应一个音，时刻递增且总时长等于小节长度", () => {
    const question = generateSightRead("4/4", 120, fixed);
    expect(question.notes).toHaveLength(question.durs.length);
    const beats = question.durs.reduce((sum, dur) => sum + durationBeats(dur), 0);
    expect(question.totalSec).toBeCloseTo(beats * 0.5);
    for (let index = 1; index < question.notes.length; index++) {
      expect(question.notes[index].onsetSec).toBeGreaterThan(question.notes[index - 1].onsetSec);
    }
    question.notes.forEach((item) => {
      expect(item.midi).toBeGreaterThanOrEqual(60);
      expect(item.midi).toBeLessThanOrEqual(72);
      expect(item.note.midi).toBe(item.midi);
    });
  });

  it("判定窗口是半拍，身份键只记拍号与节奏型", () => {
    expect(hitWindowSec(120)).toBeCloseTo(0.25);
    const a = generateSightRead("3/4", 90, fixed, ["q", "q", "q"]);
    const b = generateSightRead("3/4", 90, () => 0.9, ["q", "q", "q"]);
    expect(sightReadKey(a)).toBe(sightReadKey(b));
  });
});

describe("统一出题器", () => {
  it("七种模式都能出题并给出稳定身份键与标签", () => {
    const modes = ["note", "interval", "ear", "chord", "rhythm", "sightread", "key"] as const;
    for (const mode of modes) {
      const round = generateRound({ ...DEFAULT_SETTINGS, mode }, EMPTY_PROGRESS, undefined, undefined, fixed);
      expect(round.mode).toBe(mode);
      expect(round.key.length).toBeGreaterThan(2);
      expect(round.label.length).toBeGreaterThan(0);
      expect(round.question.notes.length).toBeGreaterThan(0);
    }
  });

  it("认调号题带上该题的调号，其余模式按设置决定是否画调号", () => {
    const key = generateRound({ ...DEFAULT_SETTINGS, mode: "key" }, EMPTY_PROGRESS, undefined, undefined, fixed);
    expect(key.keySignature).toBe(key.keyQuiz!.key.spec);
    const note = generateRound(
      { ...DEFAULT_SETTINGS, mode: "note", showKeySignature: true, keySig: "Bb" },
      EMPTY_PROGRESS, undefined, undefined, fixed,
    );
    expect(note.keySignature).toBe("Bb");
  });

  it("呈现方式：看谱不出声、听音隐藏谱面、混合按随机数决定", () => {
    const base = { ...DEFAULT_SETTINGS, mode: "interval" as const };
    expect(generateRound({ ...base, presentation: "visual" }, EMPTY_PROGRESS, undefined, undefined, fixed).aural).toBe(false);
    expect(generateRound({ ...base, presentation: "aural" }, EMPTY_PROGRESS, undefined, undefined, fixed).aural).toBe(true);
    expect(generateRound({ ...base, presentation: "mixed" }, EMPTY_PROGRESS, undefined, undefined, () => 0.1).aural).toBe(true);
    expect(generateRound({ ...base, presentation: "mixed" }, EMPTY_PROGRESS, undefined, undefined, () => 0.9).aural).toBe(false);
    // 单音模式不受呈现设置影响
    expect(generateRound({ ...DEFAULT_SETTINGS, mode: "note", presentation: "aural" }, EMPTY_PROGRESS, undefined, undefined, fixed).aural).toBe(false);
  });

  it("间隔重复权重确实进入出题：错过的题更容易被抽中", () => {
    const settings = { ...DEFAULT_SETTINGS, mode: "rhythm" as const };
    const first = generateRound(settings, EMPTY_PROGRESS, undefined, undefined, fixed);
    let progress = EMPTY_PROGRESS;
    for (let index = 0; index < 6; index++) {
      progress = recordAnswer(progress, "rhythm", first.key, false);
    }
    let hit = 0;
    for (let index = 0; index < 40; index++) {
      const round = generateRound(settings, progress);
      if (round.key === first.key) hit += 1;
    }
    expect(hit).toBeGreaterThan(0);
  });

  it("连续出题不会抛错，且每题都能给出完整呈现数据", () => {
    const modes = ["note", "interval", "ear", "chord", "rhythm", "sightread", "key"] as const;
    for (const mode of modes) {
      const settings = {
        ...DEFAULT_SETTINGS,
        mode,
        presentation: "mixed" as const,
        showKeySignature: true,
        keySig: "Eb",
        allowAccidentals: true,
      };
      let lastKey: string | undefined;
      for (let index = 0; index < 60; index++) {
        const round = generateRound(settings, EMPTY_PROGRESS, undefined, lastKey);
        expect(round.question.notes.length).toBeGreaterThan(0);
        expect(round.key).not.toBe("");
        expect(round.label).not.toBe("");
        if (mode === "rhythm") expect(round.rhythm!.options.length).toBeGreaterThan(1);
        if (mode === "key") expect(round.keyQuiz!.options).toContain(round.keyQuiz!.answer);
        if (mode === "sightread") expect(round.sightread!.notes.length).toBeGreaterThan(0);
        lastKey = round.key;
      }
    }
  });

  it("错题身份键可还原成同一道题（各模式都试一遍）", () => {
    const modes = ["note", "ear", "rhythm", "key", "sightread"] as const;
    for (const mode of modes) {
      const round = generateRound({ ...DEFAULT_SETTINGS, mode }, EMPTY_PROGRESS, undefined, undefined, fixed);
      const restored = roundFromKey(round.key, { ...DEFAULT_SETTINGS, mode }, false, fixed);
      expect(restored, `mode=${mode}`).not.toBeNull();
      expect(restored!.key, `mode=${mode}`).toBe(round.key);
    }
    expect(roundFromKey("unknown:abc", DEFAULT_SETTINGS, false, fixed)).toBeNull();
  });
});
