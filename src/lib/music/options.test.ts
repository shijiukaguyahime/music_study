import { describe, expect, it } from "vitest";
import { EAR_GUIDE, EAR_GUIDE_TOTAL, earGuidePlan } from "./theory";
import { CHORD_QUALITIES, sampleQualityOptions, type ChordQualityId } from "./chord";

const TRIADS: ChordQualityId[] = ["maj", "min", "dim", "aug"];

describe("练耳引导 1234567 · 6 · ？", () => {
  it("off：没有引导音，出题音立刻响", () => {
    const plan = earGuidePlan("off");
    expect(plan.notes).toHaveLength(0);
    expect(plan.answerAt).toBe(0);
  });

  it("on：7 个音阶音 + 结尾一个标准音 6", () => {
    const plan = earGuidePlan("on");
    expect(plan.notes).toHaveLength(8);
    expect(plan.notes.slice(0, 7).map((note) => note.midi)).toEqual([60, 62, 64, 65, 67, 69, 71]);
    expect(plan.notes[7].midi).toBe(69);
  });

  it("开头是 do，不再单弹标准音 6", () => {
    expect(earGuidePlan("on").notes[0].midi).toBe(60);
  });

  it("时间轴单调递增且都在出题音之前结束", () => {
    const plan = earGuidePlan("on");
    let previous = -1;
    for (const note of plan.notes) {
      expect(note.time).toBeGreaterThan(previous);
      expect(note.time + note.duration).toBeLessThanOrEqual(plan.answerAt + 1e-9);
      previous = note.time;
    }
  });

  it("固定 90 BPM，出题音在 11/3 秒（约 3.67 秒）后响起", () => {
    expect(earGuidePlan("on").answerAt).toBeCloseTo(11 / 3, 5);
  });

  it("默认常量与 on 档一致（兼容既有引用）", () => {
    expect(EAR_GUIDE).toEqual(earGuidePlan("on").notes);
    expect(EAR_GUIDE_TOTAL).toBeCloseTo(earGuidePlan("on").answerAt);
  });
});

describe("和弦性质选项", () => {
  it("恒 4 项、不重复、包含正确项", () => {
    for (const quality of CHORD_QUALITIES) {
      for (let i = 0; i < 40; i++) {
        const options = sampleQualityOptions(quality.id);
        expect(options).toHaveLength(4);
        expect(new Set(options).size).toBe(4);
        expect(options).toContain(quality.id);
        for (const id of options) expect(CHORD_QUALITIES.some((item) => item.id === id)).toBe(true);
      }
    }
  });

  it("干扰项含跨三/七和弦的类型", () => {
    let sawCross = false;
    for (let i = 0; i < 60; i++) {
      if (sampleQualityOptions("maj").some((id) => !TRIADS.includes(id))) sawCross = true;
    }
    expect(sawCross).toBe(true);
  });

  it("正确项位置随机，不会固定在第一格", () => {
    const positions = new Set<number>();
    for (let i = 0; i < 120; i++) positions.add(sampleQualityOptions("maj").indexOf("maj"));
    expect(positions.size).toBeGreaterThan(1);
  });
});
