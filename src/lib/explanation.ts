import { chordAnswerText } from "./music/chord";
import { noteLabel } from "./music/labels";
import { isChordQuestion, isIntervalQuestion } from "./progress";
import { MODE_CONTENT, fillTemplate } from "./learning";
import type { QuizRound } from "./quiz";
import type { Settings } from "./settings";

const CLEF_NAMES = { treble: "高音谱", bass: "低音谱", grand: "大谱表" } as const;

/** 答错后的本题解释：模板集中在 learning.json，这里只负责填入题目事实 */
export function wrongExplanation(round: QuizRound, settings: Settings): string {
  const { mode, question } = round;
  const notes = question.notes.map((note) =>
    noteLabel(note, settings.noteLabelMode, settings.chordRootPc),
  );
  const template = MODE_CONTENT[mode].wrong;

  if ((mode === "note" || mode === "ear") && notes.length > 0) {
    return fillTemplate(template, {
      answer: notes.join("、"),
      clef: CLEF_NAMES[settings.clef],
    });
  }

  if (mode === "interval" && isIntervalQuestion(question)) {
    return fillTemplate(template, {
      pair: `${notes[0]} → ${notes[1]}`,
      semitones: Math.abs(question.upper.midi - question.lower.midi),
      answer: question.name,
    });
  }

  if (mode === "chord" && isChordQuestion(question)) {
    return fillTemplate(template, {
      notes: notes.join("、"),
      answer: chordAnswerText(question),
    });
  }

  if (mode === "rhythm" && round.rhythm) {
    return fillTemplate(template, {
      answer: round.rhythm.pattern.description,
      meter: round.rhythm.pattern.meter,
    });
  }

  if (mode === "key" && round.keyQuiz) {
    return fillTemplate(template, { answer: round.keyQuiz.answer });
  }

  return template;
}
