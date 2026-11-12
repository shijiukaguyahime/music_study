import {
  RANGES,
  generateChord,
  generateEarNote,
  generateInterval,
  intervalOptions,
  noteOf,
  staffOfMidi,
  type Clef,
  type Question,
  type Range,
} from "./music/theory";
import {
  degreePool,
  generateChordQuestion,
  sampleOptions,
  sampleQualityOptions,
  type ChordQualityId,
} from "./music/chord";
import {
  generateRhythmQuestion,
  patternKey,
  rhythmPatternFromKey,
  rhythmQuestionFor,
  type RhythmQuestion,
} from "./music/rhythmQuiz";
import {
  generateKeyQuestion,
  keyQuestionFromSpec,
  keyQuestionKey,
  type KeyQuestion,
} from "./music/keySignature";
import {
  generateSightRead,
  sightReadKey,
  type SightReadQuestion,
} from "./music/sightread";
import type { DurationId } from "./music/rhythm";
import {
  describeQuestionKey,
  isChordQuestion,
  isIntervalQuestion,
  questionKey,
  weaknessWeight,
  weightedPick,
  type Progress,
} from "./progress";
import type { Settings, TrainMode } from "./settings";

/** 一道题的全部呈现所需数据（所有模式共用一条出题 / 判定链路） */
export interface QuizRound {
  mode: TrainMode;
  /** 稳定身份键：错题、反应时、间隔重复都挂在这个键上 */
  key: string;
  label: string;
  /** 传统四种模式的题目；节奏 / 认调号 / 视奏用占位值（不渲染） */
  question: Question;
  options: string[];
  qualityOptions: ChordQualityId[];
  degreeOptions: string[];
  /** 本题隐藏谱面、改为听音作答 */
  aural: boolean;
  /** 谱面要画的调号（VexFlow spec），null = 不画 */
  keySignature: string | null;
  rhythm: RhythmQuestion | null;
  keyQuiz: KeyQuestion | null;
  sightread: SightReadQuestion | null;
}

const PLACEHOLDER: Question = { staff: "treble", notes: [noteOf(60)], layout: "chord" };

export function rangeOf(settings: Settings): Range {
  return RANGES[settings.clef].find((item) => item.id === settings.rangeId) ?? RANGES[settings.clef][0];
}

function staffFor(midi: number, clef: Clef) {
  if (clef === "grand") return staffOfMidi(midi);
  return clef === "bass" ? "bass" : "treble";
}

function generateCandidate(
  mode: TrainMode,
  settings: Settings,
  range: Range,
  prevMidi?: number,
): Question {
  if (mode === "ear") return generateEarNote(settings.allowAccidentals, prevMidi);
  if (mode === "interval") return generateInterval(range, settings.clef, settings.allowAccidentals);
  if (mode === "chord") {
    return generateChordQuestion({
      diatonic: settings.chordDiatonic,
      key: { mode: settings.chordMode, rootPc: settings.chordRootPc },
      scope: settings.chordScope,
      allowInversions: settings.chordInversions,
      range,
      clef: settings.clef,
    });
  }
  return generateChord(range, settings.clef, settings.allowAccidentals, settings.noteCount, prevMidi);
}

function traditionalRound(question: Question, settings: Settings, aural: boolean): QuizRound {
  const mode = settings.mode;
  const interval = isIntervalQuestion(question) ? question : null;
  const chord = isChordQuestion(question) ? question : null;
  return {
    mode,
    key: questionKey(mode, question),
    label: describeQuestionKey(questionKey(mode, question)),
    question,
    options: mode === "interval" && interval ? intervalOptions(interval.name, settings.allowAccidentals) : [],
    qualityOptions: mode === "chord" && chord ? sampleQualityOptions(chord.quality) : [],
    degreeOptions:
      mode === "chord" && chord && chord.key && chord.degree
        ? sampleOptions(chord.degree, degreePool(chord.key, chord.isSeventh, settings.chordInversions))
        : [],
    aural,
    keySignature: settings.showKeySignature ? settings.keySig : null,
    rhythm: null,
    keyQuiz: null,
    sightread: null,
  };
}

function rhythmRound(question: RhythmQuestion, settings: Settings): QuizRound {
  return {
    mode: "rhythm",
    key: patternKey(question.pattern),
    label: describeQuestionKey(patternKey(question.pattern)),
    question: PLACEHOLDER,
    options: [],
    qualityOptions: [],
    degreeOptions: [],
    aural: false,
    keySignature: settings.showKeySignature ? settings.keySig : null,
    rhythm: question,
    keyQuiz: null,
    sightread: null,
  };
}

function keyRound(question: KeyQuestion): QuizRound {
  return {
    mode: "key",
    key: keyQuestionKey(question.key),
    label: question.answer,
    question: PLACEHOLDER,
    options: question.options,
    qualityOptions: [],
    degreeOptions: [],
    aural: false,
    keySignature: question.key.spec,
    rhythm: null,
    keyQuiz: question,
    sightread: null,
  };
}

function sightreadRound(question: SightReadQuestion, settings: Settings): QuizRound {
  return {
    mode: "sightread",
    key: sightReadKey(question),
    label: describeQuestionKey(sightReadKey(question)),
    question: PLACEHOLDER,
    options: [],
    qualityOptions: [],
    degreeOptions: [],
    aural: false,
    keySignature: settings.showKeySignature ? settings.keySig : null,
    rhythm: null,
    keyQuiz: null,
    sightread: question,
  };
}

function resolveAural(settings: Settings, rng: () => number): boolean {
  const applicable = settings.mode === "interval" || (settings.mode === "chord" && settings.chordTask === "identify");
  if (!applicable) return false;
  if (settings.presentation === "aural") return true;
  if (settings.presentation === "mixed") return rng() < 0.5;
  return false;
}

interface Candidate<T> {
  item: T;
  key: string;
  weight: number;
}

/** 统一的「错题加权 + 到期加权 + 避开上一题 + 只练错题」抽样 */
function pickCandidate<T>(
  candidates: T[],
  keyOf: (item: T) => string,
  progress: Progress,
  lastKey: string | undefined,
  focusWeak: boolean,
  rng: () => number,
): T {
  const now = Date.now();
  let pool: Candidate<T>[] = candidates.map((item) => {
    const key = keyOf(item);
    return { item, key, weight: weaknessWeight(progress, key, now) };
  });
  if (lastKey) {
    const others = pool.filter((entry) => entry.key !== lastKey);
    if (others.length > 0) pool = others;
  }
  if (focusWeak) {
    const weak = pool.filter((entry) => (progress.wrong[entry.key] ?? 0) > 0);
    if (weak.length > 0) pool = weak;
  }
  return weightedPick(pool, pool.map((entry) => entry.weight), rng).item;
}

/**
 * 从错题身份键还原一道题，供「只练本组错题」使用。
 * 音程 / 和弦靠重摇生成器命中同名题，其余可直接重建；无法还原时返回 null。
 */
export function roundFromKey(
  key: string,
  settings: Settings,
  aural: boolean,
  rng: () => number = Math.random,
): QuizRound | null {
  const split = key.indexOf(":");
  if (split < 0) return null;
  const kind = key.slice(0, split);
  const value = key.slice(split + 1);
  const range = rangeOf(settings);

  if (kind === "note" || kind === "ear") {
    const midis = value.split(",").map(Number).filter(Number.isFinite);
    if (midis.length === 0) return null;
    const notes = midis.map((midi) => noteOf(midi));
    const question: Question = {
      staff: staffFor(midis[0], settings.clef),
      notes,
      layout: "chord",
    };
    const saved = { ...settings, mode: kind as TrainMode };
    const round = traditionalRound(question, saved, aural);
    return { ...round, key };
  }

  if (kind === "interval") {
    const saved = { ...settings, mode: "interval" as TrainMode };
    for (let attempt = 0; attempt < 160; attempt++) {
      const question = generateInterval(range, settings.clef, settings.allowAccidentals);
      if (questionKey("interval", question) === key) return traditionalRound(question, saved, aural);
    }
    return null;
  }

  if (kind === "chord") {
    const saved = { ...settings, mode: "chord" as TrainMode };
    for (let attempt = 0; attempt < 160; attempt++) {
      const question = generateChordQuestion({
        diatonic: settings.chordDiatonic,
        key: { mode: settings.chordMode, rootPc: settings.chordRootPc },
        scope: settings.chordScope,
        allowInversions: settings.chordInversions,
        range,
        clef: settings.clef,
      });
      if (questionKey("chord", question) === key) return traditionalRound(question, saved, aural);
    }
    return null;
  }

  if (kind === "rhythm") {
    const pattern = rhythmPatternFromKey(key);
    return pattern ? rhythmRound(rhythmQuestionFor(pattern, rng), settings) : null;
  }

  if (kind === "key") {
    const question = keyQuestionFromSpec(value, rng);
    return question ? keyRound(question) : null;
  }

  if (kind === "sightread") {
    const [meter, id] = value.split(":");
    if (meter && id) {
      const durs = id.split(",") as DurationId[];
      const question = generateSightRead(meter as Settings["meter"], settings.bpm, rng, durs);
      const round = sightreadRound(question, settings);
      return round.key === key ? round : null;
    }
  }

  return null;
}

/** 出一道题：按模式分派，并统一走间隔重复权重 */
export function generateRound(
  settings: Settings,
  progress: Progress,
  prevMidi?: number,
  lastKey?: string,
  rng: () => number = Math.random,
): QuizRound {
  const { mode } = settings;
  const aural = resolveAural(settings, rng);

  if (mode === "rhythm") {
    const candidates = Array.from({ length: 5 }, () => generateRhythmQuestion(settings.meter, rng));
    const picked = pickCandidate(candidates, (item) => patternKey(item.pattern), progress, lastKey, settings.focusWeak, rng);
    return rhythmRound(picked, settings);
  }

  if (mode === "key") {
    const candidates = Array.from({ length: 5 }, () => generateKeyQuestion(settings.keyQuizScope, rng));
    const picked = pickCandidate(candidates, (item) => keyQuestionKey(item.key), progress, lastKey, settings.focusWeak, rng);
    return keyRound(picked);
  }

  if (mode === "sightread") {
    const candidates = Array.from({ length: 3 }, () => generateSightRead(settings.meter, settings.bpm, rng));
    const picked = pickCandidate(candidates, sightReadKey, progress, lastKey, settings.focusWeak, rng);
    return sightreadRound(picked, settings);
  }

  const range = rangeOf(settings);
  const candidates = Array.from({ length: 5 }, () =>
    generateCandidate(mode, settings, range, prevMidi),
  );
  const picked = pickCandidate(
    candidates,
    (item) => questionKey(mode, item),
    progress,
    lastKey,
    settings.focusWeak,
    rng,
  );
  return traditionalRound(picked, settings, aural);
}
