import content from "@/content/learning.json";
import type { TrainMode } from "./settings";

export interface ModeGroup {
  id: string;
  label: string;
  modes: TrainMode[];
}

/** 零基础概念卡：一个术语配一段人话解释 */
export interface ModeConcept {
  term: string;
  text: string;
}

export interface ModeLearning {
  label: string;
  shortLabel: string;
  /** 小知识 / 小技巧：常驻在页面上随机轮换，不承担教学任务 */
  tips: string[];
  /** 入门答疑开头的「这一页在练什么」 */
  intro: string;
  /** 零基础必备概念：不懂这些就没法开始练 */
  concepts: ModeConcept[];
  question: string;
  how: string[];
  /** 新手最容易踩的坑 */
  pitfalls: string[];
  /** 答错解释模板；动态数据由 wrongExplanation() 填入 */
  wrong: string;
}

/** 顶栏分组与学习顺序的唯一数据源；改 JSON 即可调整，不动布局代码 */
export const MODE_GROUPS = content.groups as ModeGroup[];
export const ORDERED_MODES = MODE_GROUPS.flatMap((group) => group.modes);
export const MODE_CONTENT = content.modes as Record<TrainMode, ModeLearning>;
export const SETTING_HINTS: Record<string, string> = content.settings;

export function fillTemplate(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(values[key] ?? ""));
}

/**
 * 从某个模式的小技巧池里随机取一条。
 * 传入上一条时先把重复项排除，避免连续两题看到同一句。
 */
export function pickTip(mode: TrainMode, previous?: string): string {
  const tips = MODE_CONTENT[mode]?.tips ?? [];
  if (tips.length === 0) return "";
  if (tips.length === 1) return tips[0];
  const pool = previous ? tips.filter((tip) => tip !== previous) : tips;
  return pool[Math.floor(Math.random() * pool.length)] ?? tips[0];
}
