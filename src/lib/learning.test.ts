import { describe, expect, it } from "vitest";
import {
  MODE_CONTENT,
  MODE_GROUPS,
  ORDERED_MODES,
  SETTING_HINTS,
  fillTemplate,
  pickTip,
} from "./learning";
import { TRAIN_MODES, DEFAULT_SETTINGS } from "./settings";
import { wrongExplanation } from "./explanation";
import { generateRound } from "./quiz";
import { roundFromKey } from "./quiz";

describe("learning content config", () => {
  it("分组覆盖全部训练模式，不重不漏，只调整顺序", () => {
    expect([...ORDERED_MODES].sort()).toEqual([...TRAIN_MODES].sort());
    const flat = MODE_GROUPS.flatMap((group) => group.modes);
    expect(new Set(flat).size).toBe(flat.length);
  });

  it("分组按「谱面基础 → 音的关系 → 听与弹」排列", () => {
    expect(MODE_GROUPS.map((group) => group.id)).toEqual([
      "staff-basics",
      "pitch-relations",
      "listening-playing",
    ]);
    expect(ORDERED_MODES).toEqual([
      "note", "rhythm", "key", "interval", "chord", "ear", "sightread",
    ]);
  });

  it("每个模式的提示文案齐备且不含模板占位符", () => {
    for (const mode of TRAIN_MODES) {
      const content = MODE_CONTENT[mode];
      expect(content.label.length).toBeGreaterThan(0);
      expect(content.shortLabel.length).toBeGreaterThan(0);
      // 主区每次随机提醒一条，池子太薄就会反复看到同一句
      expect(content.tips.length).toBeGreaterThanOrEqual(5);
      expect(new Set(content.tips).size).toBe(content.tips.length);
      content.tips.forEach((tip) => expect(tip.length).toBeGreaterThan(10));
      expect(content.question.length).toBeGreaterThan(6);
      expect(content.how.length).toBeGreaterThanOrEqual(2);
      // tips / question / how 是静态文案，出现 {{ 说明模板误放错了地方
      [...content.tips, content.question, ...content.how].forEach((text) => {
        expect(text).not.toMatch(/\{\{/);
      });
    }
  });

  it("入门答疑齐备：练什么 + 概念卡 + 常踩的坑", () => {
    for (const mode of TRAIN_MODES) {
      const content = MODE_CONTENT[mode];
      expect(content.intro.length).toBeGreaterThan(20);
      // 零基础得先懂几个词才能开始，太少说明答疑没写够
      expect(content.concepts.length).toBeGreaterThanOrEqual(4);
      const terms = content.concepts.map((concept) => concept.term);
      expect(new Set(terms).size).toBe(terms.length);
      content.concepts.forEach((concept) => {
        // 术语允许单字（「拍」「调」），但不能是空串
        expect(concept.term.trim().length).toBeGreaterThan(0);
        expect(concept.text.length).toBeGreaterThan(15);
        expect(concept.text).not.toMatch(/\{\{/);
      });
      expect(content.pitfalls.length).toBeGreaterThanOrEqual(2);
      content.pitfalls.forEach((item) => expect(item.length).toBeGreaterThan(8));
    }
  });

  it("小技巧随机取一条，且不会连着两次相同", () => {
    for (const mode of TRAIN_MODES) {
      const tips = MODE_CONTENT[mode].tips;
      for (let index = 0; index < 40; index += 1) {
        const picked = pickTip(mode);
        expect(tips).toContain(picked);
        expect(pickTip(mode, picked)).not.toBe(picked);
      }
    }
  });

  it("每个模式的答错模板都能被完整渲染（不留 {{ }}）", () => {
    for (const mode of TRAIN_MODES) {
      const rendered = fillTemplate(MODE_CONTENT[mode].wrong, { answer: "X", notes: "X", pair: "X", semitones: 3, meter: "4/4", clef: "高音谱" });
      expect(rendered).not.toMatch(/\{\{|\}\}/);
    }
  });

  it("关键设置项都有人话注解", () => {
    [
      "wrongManualNext", "clef", "range", "accidentals", "chordDiatonic", "chordInversions",
      "presentation", "noteLabelMode", "meter", "keyQuizScope", "countIn", "keySignature",
    ].forEach((id) => {
      expect(SETTING_HINTS[id].length).toBeGreaterThan(8);
    });
  });

  it("fillTemplate 跳过缺失的变量并保留其余文本", () => {
    expect(fillTemplate("a{{x}}b{{y}}c", { y: 2 })).toBe("ab2c");
  });
});

describe("wrongExplanation", () => {
  const settings = DEFAULT_SETTINGS;

  it("单音题：给出答案音名与谱号", () => {
    const round = roundFromKey("note:60", settings, false);
    expect(round).not.toBeNull();
    const text = wrongExplanation(round!, { ...settings, mode: "note" });
    expect(text).toContain("C4");
    expect(text).toContain("高音谱");
    expect(text).not.toMatch(/\{\{/);
  });

  it("练耳题：给出答案音名", () => {
    const round = roundFromKey("ear:67", settings, false);
    const text = wrongExplanation(round!, { ...settings, mode: "ear" });
    expect(text).toContain("G4");
    expect(text).not.toMatch(/\{\{/);
  });

  it("音程题：给出两个音与半音数", () => {
    for (let index = 0; index < 120; index += 1) {
      const round = generateRound({ ...settings, mode: "interval" }, { groups: {}, wrong: {}, seen: {}, reactions: {}, memory: {} });
      const text = wrongExplanation(round, { ...settings, mode: "interval" });
      expect(text).toContain("个半音");
      expect(text).toContain("所以是");
      expect(text).not.toMatch(/\{\{/);
    }
  });

  it("和弦题：给出组成音与和弦名", () => {
    for (let index = 0; index < 120; index += 1) {
      const round = generateRound({ ...settings, mode: "chord" }, { groups: {}, wrong: {}, seen: {}, reactions: {}, memory: {} });
      const text = wrongExplanation(round, { ...settings, mode: "chord" });
      expect(text).toContain("合起来是");
      expect(text).not.toMatch(/\{\{/);
    }
  });

  it("节奏题：给出节奏描述与拍号", () => {
    const round = roundFromKey("rhythm:4/4:q,8,8,q", settings, false);
    const text = wrongExplanation(round!, { ...settings, mode: "rhythm" });
    expect(text).toContain("四分 八分 八分 四分");
    expect(text).toContain("4/4");
    expect(text).not.toMatch(/\{\{/);
  });

  it("认调号题：给出正确调名", () => {
    const round = roundFromKey("key:G", settings, false);
    const text = wrongExplanation(round!, { ...settings, mode: "key" });
    expect(text).toContain("G大调");
    expect(text).not.toMatch(/\{\{/);
  });

  it("视奏题：给出调速建议", () => {
    const round = roundFromKey("sightread:4/4:q,q,q,q", settings, false);
    const text = wrongExplanation(round!, { ...settings, mode: "sightread" });
    expect(text).toContain("BPM");
    expect(text).not.toMatch(/\{\{/);
  });
});
