import { describe, expect, it } from "vitest";
import {
  REACTION_WINDOW,
  REVIEW_INTERVALS,
  clearWeakness,
  describeQuestionKey,
  groupKey,
  isChordQuestion,
  isDue,
  loadProgress,
  questionKey,
  reactionSummary,
  recordAnswer,
  resetGroup,
  statsOf,
  topWeaknesses,
  weaknessWeight,
  weightedPick,
  EMPTY_PROGRESS,
  type Progress,
} from "./progress";
import { generateEarNote, generateInterval, RANGES, type Note } from "./music/theory";
import { generateChordQuestion } from "./music/chord";

const C4: Note = { midi: 60, pc: 0, letter: "C", acc: "", octave: 4 };
const E4: Note = { midi: 64, pc: 4, letter: "E", acc: "", octave: 4 };
const NOW = 1_700_000_000_000;

describe("配置分组与题目身份键", () => {
  it("无需谱号的模式单独一组，其余按模式 + 谱号 + 音域分组", () => {
    expect(groupKey("ear", "bass", "c2-c4")).toBe("ear");
    expect(groupKey("rhythm", "bass", "c2-c4")).toBe("rhythm");
    expect(groupKey("note", "treble", "c4-c6")).toBe("note|treble|c4-c6");
    expect(groupKey("note", "bass", "c2-c4")).not.toBe(groupKey("note", "treble", "c4-c6"));
  });

  it("单音 / 多音按完整音高，且与顺序无关", () => {
    const a = questionKey("note", { staff: "treble", notes: [C4, E4], layout: "chord" });
    const b = questionKey("note", { staff: "treble", notes: [E4, C4], layout: "sequence" });
    expect(a).toBe("note:60,64");
    expect(a).toBe(b);
  });

  it("练耳与音程 / 和弦的身份键各自区分维度", () => {
    const ear = generateEarNote(false);
    expect(questionKey("ear", ear)).toBe(`ear:${ear.notes[0].midi}`);
    const interval = generateInterval(RANGES.treble[0], "treble", false);
    expect(questionKey("interval", interval)).toBe(`interval:${interval.name}`);
    const chord = generateChordQuestion({
      diatonic: true,
      key: { mode: "major", rootPc: 0 },
      scope: "both",
      allowInversions: true,
      range: RANGES.treble[0],
      clef: "treble",
    });
    expect(isChordQuestion(chord)).toBe(true);
    expect(questionKey("chord", chord)).toBe(`chord:${chord.quality}|${chord.degree}`);
  });

  it("身份键可以转成可读标签", () => {
    expect(describeQuestionKey("note:60")).toBe("C4");
    expect(describeQuestionKey("note:60,64")).toBe("C4 · E4");
    expect(describeQuestionKey("interval:小三度")).toBe("小三度");
    expect(describeQuestionKey("chord:dom7|V7")).toBe("属七 · V7");
    expect(describeQuestionKey("rhythm:4/4:q,8,8,q")).toBe("节奏 4/4 四分 八分 八分 四分");
    expect(describeQuestionKey("key:G")).toBe("G大调");
    expect(describeQuestionKey("sightread:4/4:q,q,q,q")).toBe("视奏 4/4 四分 四分 四分 四分");
  });
});

describe("成绩与错题记录", () => {
  it("答对累计正确率与连击，答错清空连击并保留最佳", () => {
    let progress = EMPTY_PROGRESS;
    progress = recordAnswer(progress, "g", "note:60", true);
    progress = recordAnswer(progress, "g", "note:62", true);
    progress = recordAnswer(progress, "g", "note:64", false);
    expect(statsOf(progress, "g")).toEqual({ total: 3, correct: 2, streak: 0, best: 2 });
  });

  it("不同配置分组互不干扰", () => {
    let progress = EMPTY_PROGRESS;
    progress = recordAnswer(progress, "note|treble|c4-c6", "note:60", true);
    progress = recordAnswer(progress, "note|bass|c2-c4", "note:48", false);
    expect(statsOf(progress, "note|treble|c4-c6").total).toBe(1);
    expect(statsOf(progress, "note|bass|c2-c4").total).toBe(1);
  });

  it("只有答错才累计错次，seen 记录每次作答", () => {
    let progress = EMPTY_PROGRESS;
    progress = recordAnswer(progress, "g", "note:60", false);
    progress = recordAnswer(progress, "g", "note:60", true);
    expect(progress.wrong["note:60"]).toBe(1);
    expect(progress.seen["note:60"]).toBe(2);
  });

  it("重置只清当前分组，清空记录只清题目级数据", () => {
    let progress: Progress = EMPTY_PROGRESS;
    progress = recordAnswer(progress, "g1", "note:60", false, { reactionMs: 500 });
    progress = recordAnswer(progress, "g2", "note:64", false);
    const reset = resetGroup(progress, "g1");
    expect(statsOf(reset, "g1").total).toBe(0);
    expect(statsOf(reset, "g2").total).toBe(1);
    const cleared = clearWeakness(reset);
    expect(cleared.wrong).toEqual({});
    expect(cleared.reactions).toEqual({});
    expect(cleared.memory).toEqual({});
    expect(statsOf(cleared, "g2").total).toBe(1);
  });

  it("易错排行按错次降序，错次相同按错误率", () => {
    let progress = EMPTY_PROGRESS;
    progress = recordAnswer(progress, "g", "note:60", false);
    progress = recordAnswer(progress, "g", "note:60", false);
    progress = recordAnswer(progress, "g", "note:64", false);
    progress = recordAnswer(progress, "g", "note:64", true);
    const rows = topWeaknesses(progress, 5);
    expect(rows.map((row) => row.key)).toEqual(["note:60", "note:64"]);
    expect(rows[0].wrong).toBe(2);
    expect(rows[1].rate).toBeCloseTo(0.5);
  });
});

describe("反应时长", () => {
  it("按身份键累计且只保留最近 N 次", () => {
    let progress = EMPTY_PROGRESS;
    for (let index = 0; index < REACTION_WINDOW + 5; index++) {
      progress = recordAnswer(progress, "g", "note:60", true, { reactionMs: index * 10 });
    }
    const list = progress.reactions["note:60"];
    expect(list).toHaveLength(REACTION_WINDOW);
    expect(list[0]).toBe(50);
    expect(list[list.length - 1]).toBe((REACTION_WINDOW + 4) * 10);
  });

  it("reactionSummary 给出均值、中位数与最慢的题", () => {
    let progress = EMPTY_PROGRESS;
    progress = recordAnswer(progress, "g", "note:60", true, { reactionMs: 500 });
    progress = recordAnswer(progress, "g", "note:60", true, { reactionMs: 700 });
    progress = recordAnswer(progress, "g", "note:64", true, { reactionMs: 200 });
    const summary = reactionSummary(progress, 3);
    expect(summary.count).toBe(3);
    expect(summary.avgMs).toBeCloseTo(1400 / 3);
    expect(summary.medianMs).toBe(500);
    expect(summary.slowest[0]).toEqual({ key: "note:60", label: "C4", ms: 600 });
  });

  it("排行可切换成按反应慢排序", () => {
    let progress = EMPTY_PROGRESS;
    progress = recordAnswer(progress, "g", "note:60", true, { reactionMs: 200 });
    progress = recordAnswer(progress, "g", "note:64", false, { reactionMs: 1500 });
    const rows = topWeaknesses(progress, 5, "slow");
    expect(rows[0].key).toBe("note:64");
    expect(rows[0].reactionMs).toBe(1500);
  });
});

describe("间隔重复", () => {
  it("答对进入复习间隔，答错立刻到期且熟练度归零", () => {
    const passed = recordAnswer(EMPTY_PROGRESS, "g", "note:60", true, { now: NOW });
    expect(passed.memory["note:60"].level).toBe(1);
    expect(passed.memory["note:60"].dueAt).toBe(NOW + REVIEW_INTERVALS[0]);
    expect(isDue(passed, "note:60", NOW + 1000)).toBe(false);
    expect(isDue(passed, "note:60", NOW + REVIEW_INTERVALS[0])).toBe(true);

    const failed = recordAnswer(passed, "g", "note:60", false, { now: NOW + 1000 });
    expect(failed.memory["note:60"].level).toBe(0);
    expect(failed.memory["note:60"].dueAt).toBe(NOW + 1000);
    expect(isDue(failed, "note:60", NOW + 1001)).toBe(true);
  });

  it("连续答对逐级拉长复习间隔", () => {
    let progress = EMPTY_PROGRESS;
    progress = recordAnswer(progress, "g", "note:60", true, { now: NOW });
    progress = recordAnswer(progress, "g", "note:60", true, { now: NOW + REVIEW_INTERVALS[0] });
    expect(progress.memory["note:60"].level).toBe(2);
    expect(progress.memory["note:60"].dueAt).toBe(NOW + REVIEW_INTERVALS[0] + REVIEW_INTERVALS[1]);
  });

  it("到期题权重更高，答错题权重最高", () => {
    const fresh = recordAnswer(EMPTY_PROGRESS, "g", "note:60", true, { now: NOW });
    expect(weaknessWeight(fresh, "note:60", NOW + 1000)).toBe(1);
    expect(weaknessWeight(fresh, "note:60", NOW + REVIEW_INTERVALS[0])).toBe(2);
    expect(weaknessWeight(EMPTY_PROGRESS, "note:60", NOW)).toBe(2);
    const failed = recordAnswer(EMPTY_PROGRESS, "g", "note:60", false, { now: NOW });
    // 答错后立刻到期：1 基础 + 2×错次 + 1 到期 = 4
    expect(weaknessWeight(failed, "note:60", NOW + 1000)).toBe(4);
  });
});

describe("统计按训练模式隔离", () => {
  it("反应时概览与易错排行只统计指定模式", () => {
    let progress = EMPTY_PROGRESS;
    progress = recordAnswer(progress, "g", "note:60", false, { reactionMs: 900 });
    progress = recordAnswer(progress, "g", "key:G", false, { reactionMs: 3000 });
    progress = recordAnswer(progress, "g", "rhythm:4/4:q,q,q,q", false, { reactionMs: 5000 });

    expect(reactionSummary(progress, 3, "note").count).toBe(1);
    expect(reactionSummary(progress, 3, "note").avgMs).toBe(900);
    expect(reactionSummary(progress, 3, "key").avgMs).toBe(3000);
    expect(reactionSummary(progress, 3).count).toBe(3);
    expect(topWeaknesses(progress, 5, "wrong", "note").map((row) => row.key)).toEqual(["note:60"]);
    expect(topWeaknesses(progress, 5, "slow", "key").map((row) => row.key)).toEqual(["key:G"]);
  });

  it("清空记录可以只清当前模式，成绩仍保留", () => {
    let progress = EMPTY_PROGRESS;
    progress = recordAnswer(progress, "g", "note:60", false, { reactionMs: 700 });
    progress = recordAnswer(progress, "g", "key:G", true, { reactionMs: 500 });
    const cleared = clearWeakness(progress, "note");
    expect(cleared.wrong["note:60"]).toBeUndefined();
    expect(cleared.reactions["note:60"]).toBeUndefined();
    expect(cleared.memory["note:60"]).toBeUndefined();
    expect(cleared.seen["key:G"]).toBe(1);
    expect(cleared.reactions["key:G"]).toEqual([500]);
    expect(cleared.memory["key:G"]).toBeDefined();
    expect(statsOf(cleared, "g").total).toBe(2);
  });
});

describe("加权抽样与持久化", () => {
  it("加权抽样按权重落点，空权重等概率兜底", () => {
    const items = ["a", "b", "c"];
    expect(weightedPick(items, [1, 0, 0], () => 0)).toBe("a");
    expect(weightedPick(items, [0, 1, 0], () => 0)).toBe("b");
    expect(weightedPick(items, [1, 1, 1], () => 0.99)).toBe("c");
    expect(() => weightedPick([], [])).toThrow();
  });

  it("无 localStorage 环境（测试环境）安全回落", () => {
    expect(loadProgress()).toEqual(EMPTY_PROGRESS);
  });
});
