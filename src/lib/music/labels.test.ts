import { describe, expect, it } from "vitest";
import { letterLabel, midiLabelFor, movableLabel, noteLabel, solfegeZh } from "./labels";
import type { Letter, Note } from "./theory";

function make(letter: Letter, acc: "" | "#" | "b", octave: number, midi: number): Note {
  return { midi, pc: ((midi % 12) + 12) % 12, letter, acc, octave };
}

const F4 = make("F", "", 4, 65);
const ESharp4 = make("E", "#", 4, 65);
const FSharp4 = make("F", "#", 4, 66);
const Bb4 = make("B", "b", 4, 70);
const Cb5 = make("C", "b", 5, 71);
const BSharp4 = make("B", "#", 4, 60);

describe("首调唱名 / 简谱按音名拼写换算", () => {
  it("没开升降号时自然音 F 显示 Fa / 4，不再是升 mi", () => {
    expect(noteLabel(F4, "solfege", 0)).toBe("Fa");
    expect(noteLabel(F4, "number", 0)).toBe("4");
    expect(solfegeZh(F4)).toBe("fa");
    expect(letterLabel(F4)).toBe("F4");
  });

  it("同音高的 E♯ 才显示升 Mi / ♯3", () => {
    expect(movableLabel(ESharp4, "solfege", 0)).toBe("升Mi");
    expect(movableLabel(ESharp4, "number", 0)).toBe("♯3");
  });

  it("黑键按自身拼写显示升号或降号", () => {
    expect(movableLabel(FSharp4, "solfege", 0)).toBe("升Fa");
    expect(movableLabel(FSharp4, "number", 0)).toBe("♯4");
    expect(movableLabel(Bb4, "solfege", 0)).toBe("降Si");
    expect(movableLabel(Bb4, "number", 0)).toBe("♭7");
  });

  it("等音拼写 C♭ / B♯ 也跟随音名", () => {
    expect(movableLabel(Cb5, "solfege", 0)).toBe("降Do");
    expect(movableLabel(BSharp4, "solfege", 0)).toBe("升Si");
  });

  it("首调主音不是 C 时，级数与升降仍按音名计算", () => {
    // D 大调：F 是降三级，F♯ 才是三级
    expect(movableLabel(F4, "solfege", 2)).toBe("降Mi");
    expect(movableLabel(FSharp4, "solfege", 2)).toBe("Mi");
    // D 大调：C 是降七级
    expect(movableLabel(make("C", "", 4, 60), "solfege", 2)).toBe("降Si");
  });

  it("只有 MIDI 时用升号拼写，但自然音不会被误标", () => {
    expect(midiLabelFor(65, "solfege", 0)).toBe("Fa");
    expect(midiLabelFor(65, "number", 0)).toBe("4");
    expect(midiLabelFor(64, "solfege", 0)).toBe("Mi");
    expect(midiLabelFor(66, "solfege", 0)).toBe("升Fa");
    expect(midiLabelFor(60, "solfege", 0)).toBe("Do");
  });
});
