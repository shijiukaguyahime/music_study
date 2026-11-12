import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Circle,
  Headphones,
  RotateCcw,
  RotateCw,
  Timer,
  Volume2,
  XCircle,
} from "lucide-react";
import { ChordOptions } from "@/components/ChordOptions";
import { FreePlay } from "@/components/FreePlay";
import { IntervalOptions } from "@/components/IntervalOptions";
import { Metronome } from "@/components/Metronome";
import { PianoKeyboard } from "@/components/PianoKeyboard";
import { RhythmOptions } from "@/components/RhythmOptions";
import { ScratchKeyboard } from "@/components/ScratchKeyboard";
import { SettingsPanel, type TrainMode } from "@/components/SettingsPanel";
import { SessionPanel } from "@/components/SessionPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

// vexflow 较重：谱面组件按需加载，单音/练耳首屏不下载 vexflow
const StaffSheet = lazy(() =>
  import("@/components/StaffSheet").then((m) => ({ default: m.StaffSheet })),
);
const PhrasePractice = lazy(() =>
  import("@/components/PhrasePractice").then((m) => ({ default: m.PhrasePractice })),
);
const SightReadPractice = lazy(() =>
  import("@/components/SightReadPractice").then((m) => ({ default: m.SightReadPractice })),
);

import { getAudioContext, playKey, playMidi, preloadPiano, scheduleClick, stopAllNotes } from "@/lib/audio";
import {
  KEY_HINTS,
  RANGES,
  earGuidePlan,
  octaveGroupRoot,
  pcOf,
  shortcutMidi,
  type Clef,
} from "@/lib/music/theory";
import { chordAnswerText, chordPromptDesc, type ChordQualityId } from "@/lib/music/chord";
import { rhythmTimeline } from "@/lib/music/rhythmQuiz";
import { formatMs, midiLabelFor, noteLabel } from "@/lib/music/labels";
import { generateRound, rangeOf, roundFromKey, type QuizRound } from "@/lib/quiz";
import {
  clearWeakness,
  groupKey,
  isChordQuestion,
  isIntervalQuestion,
  loadProgress,
  reactionSummary,
  recordAnswer,
  resetGroup,
  saveProgress,
  statsOf,
  topWeaknesses,
  type Progress,
} from "@/lib/progress";
import {
  emptySession,
  ensureSessions,
  loadSessions,
  recordSessionAnswer,
  saveSessions,
  summarizeSession,
  type CompleteSessionMap,
  type SessionState,
} from "@/lib/session";
import { loadSettings, saveSettings, type SessionSize, type Settings } from "@/lib/settings";
import { useMidiInput } from "@/lib/midi";

/** 顶栏视图：训练 / 自由演奏 / 乐句视唱 */
type View = "train" | "free" | "phrase";

const MODE_LABELS: Record<TrainMode, string> = {
  note: "单音",
  interval: "音程",
  ear: "练耳",
  chord: "和弦",
  rhythm: "节奏",
  sightread: "视奏",
  key: "认调号",
};
const CLEF_LABELS: Record<Clef, string> = { treble: "高音谱", bass: "低音谱", grand: "大谱表" };

const MODE_BUTTONS: { mode: TrainMode; label: string }[] = [
  { mode: "note", label: "单音训练" },
  { mode: "interval", label: "音程训练" },
  { mode: "ear", label: "练耳训练" },
  { mode: "chord", label: "和弦训练" },
  { mode: "rhythm", label: "节奏训练" },
  { mode: "sightread", label: "视奏练习" },
  { mode: "key", label: "认调号" },
];

/** 只有这些字段变化才需要换个题；音量、标记、题数等不该打断当前题 */
function questionSeed(settings: Settings): string {
  return [
    settings.mode, settings.clef, settings.rangeId, settings.allowAccidentals,
    settings.noteCount, settings.earGuideMode, settings.chordMode,
    settings.chordRootPc, settings.chordTask, settings.chordDiatonic,
    settings.chordScope, settings.chordInversions, settings.focusWeak,
    settings.presentation, settings.keyQuizScope, settings.keySig,
    settings.showKeySignature, settings.bpm, settings.meter, settings.countIn,
  ].join("|");
}

function SheetFallback() {
  return (
    <Card>
      <CardContent className="min-h-[220px] py-16 text-center text-sm text-muted-foreground">
        正在加载谱面…
      </CardContent>
    </Card>
  );
}

export default function App() {
  /** 首屏：一次性读出持久化的设置 / 进度 / 各模式的一组练习，并据此生成第一道题，避免闪换 */
  const [initial] = useState(() => {
    const settings = loadSettings();
    const progress = loadProgress();
    const round = generateRound(settings, progress, undefined, undefined);
    const sessions = ensureSessions(loadSessions(), settings.sessionSize);
    return { settings, progress, round, sessions };
  });

  const [settings, setSettings] = useState<Settings>(initial.settings);
  const [view, setView] = useState<View>("train");
  const [notesHidden, setNotesHidden] = useState(false);
  const [metronomeOpen, setMetronomeOpen] = useState(false);
  /** 本题的声音还在播放时为 false，播放期间不接受作答 */
  const [questionReady, setQuestionReady] = useState(true);

  const [round, setRound] = useState<QuizRound>(initial.round);
  const [attempt, setAttempt] = useState(0);
  const [pressed, setPressed] = useState<number[]>([]);
  const [pickedOption, setPickedOption] = useState<string | null>(null);
  const [pickedQuality, setPickedQuality] = useState<ChordQualityId | null>(null);
  const [pickedDegree, setPickedDegree] = useState<string | null>(null);
  const [pickedRhythm, setPickedRhythm] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [ok, setOk] = useState(false);
  /** 当前是「重试本题」的回合，不再重复计分 */
  const [retry, setRetry] = useState(false);
  const [progress, setProgress] = useState<Progress>(initial.progress);
  /** 每个训练模式一组独立练习；切 tab 只看到自己的进度与小结 */
  const [sessions, setSessions] = useState<CompleteSessionMap>(initial.sessions);
  const session = sessions[settings.mode];
  /** 非 null 时只在指定错题里出题（本组错题专项） */
  const [reviewKeys, setReviewKeys] = useState<string[] | null>(null);

  const timerRef = useRef<number | null>(null);
  const playbackTimersRef = useRef<number[]>([]);
  const lastMidiRef = useRef<number | undefined>(initial.round.question.notes[0]?.midi);
  const lastKeyRef = useRef<string>(initial.round.key);
  const lastNextRef = useRef(0);
  /** 本题「可作答」的时间戳；反应时长从这里起算 */
  const readyAtRef = useRef(Date.now());
  const reviewKeysRef = useRef<string[] | null>(null);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const roundRef = useRef(round);
  roundRef.current = round;
  const doneRef = useRef(done);
  doneRef.current = done;
  const retryRef = useRef(retry);
  retryRef.current = retry;
  const handlerRef = useRef<(event: KeyboardEvent) => void>(() => {});
  const answerNoteRef = useRef<(midi: number) => void>(() => {});
  const sightreadPickRef = useRef<((midi: number) => void) | null>(null);

  const range = useMemo(() => rangeOf(settings), [settings.clef, settings.rangeId]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  /** 只改当前训练模式那一组；切 tab 时 session 会自动切到对应分桶 */
  const updateSession = useCallback((updater: (prev: SessionState) => SessionState) => {
    setSessions((prev) => {
      const mode = settingsRef.current.mode;
      return { ...prev, [mode]: updater(prev[mode]) };
    });
  }, []);

  useEffect(() => saveSettings(settings), [settings]);
  useEffect(() => saveProgress(progress), [progress]);
  useEffect(() => saveSessions(sessions), [sessions]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearPlayback = useCallback(() => {
    playbackTimersRef.current.forEach((id) => window.clearTimeout(id));
    playbackTimersRef.current = [];
    stopAllNotes();
  }, []);

  useEffect(() => () => clearPlayback(), [clearPlayback]);

  const markReady = useCallback(() => {
    readyAtRef.current = Date.now();
  }, []);

  /**
   * 播放本题的声音，返回「多久之后可以开始计时 / 作答」（秒）。
   * force=true 用于「重听答案」：视觉题也把音弹出来。
   */
  const playQuestionSound = useCallback((target: QuizRound, force = false): number => {
    const ctx = getAudioContext();
    const base = ctx ? ctx.currentTime + 0.03 : 0;
    const when = (offset: number) => (ctx ? base + offset : undefined);

    if (target.mode === "ear") {
      const plan = earGuidePlan(settingsRef.current.earGuideMode);
      for (const note of plan.notes) {
        playMidi(note.midi, note.duration, 0.24, when(note.time));
      }
      playMidi(target.question.notes[0].midi, 1.0, 0.26, when(plan.answerAt));
      return plan.answerAt;
    }

    if (target.mode === "rhythm" && target.rhythm) {
      const { onsets, totalSec } = rhythmTimeline(target.rhythm.pattern, settingsRef.current.bpm);
      onsets.forEach((time, index) => {
        scheduleClick(base + time, index === 0, 0.9, true);
        playMidi(index === 0 ? 76 : 72, 0.12, 0.16, when(time));
      });
      return totalSec;
    }

    if (target.mode === "key" || target.mode === "sightread") return 0;

    const notes = target.question.notes;
    const sequential = target.mode === "interval";
    const shouldPlay = target.aural || force;
    if (shouldPlay) {
      notes.forEach((note, index) => {
        playMidi(note.midi, sequential ? 0.85 : 1.0, 0.24, when(sequential ? index * 0.55 : 0));
      });
    }
    const duration = sequential ? notes.length * 0.55 : 1.0;
    return shouldPlay ? duration : 0;
  }, []);

  /** 声音播完后才开放作答，并以此刻作为反应时长起点 */
  const armQuestion = useCallback(
    (delaySec: number) => {
      playbackTimersRef.current.forEach((id) => window.clearTimeout(id));
      playbackTimersRef.current = [];
      readyAtRef.current = 0;
      if (delaySec > 0) {
        setQuestionReady(false);
        playbackTimersRef.current = [
          window.setTimeout(() => {
            setQuestionReady(true);
            markReady();
          }, delaySec * 1000 + 100),
        ];
      } else {
        setQuestionReady(true);
        markReady();
      }
    },
    [markReady],
  );

  // 启动即预载钢琴采样（失败时播放自动退回合成音）
  useEffect(() => {
    void preloadPiano();
  }, []);

  // 上次停在练耳 / 节奏 / 听音模式时，首屏补播一次本题
  useEffect(() => {
    const s = settingsRef.current;
    const r = roundRef.current;
    if (s.mode === "ear" || s.mode === "rhythm" || r.aural) {
      const delay = playQuestionSound(r);
      armQuestion(delay);
    }
    // 严格模式下首次挂载的 cleanup 会掐掉声音，重挂载时正好补播一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nextQuestion = useCallback(() => {
    clearTimer();
    clearPlayback();
    const s = settingsRef.current;
    const auralForReview =
      (s.mode === "interval" || (s.mode === "chord" && s.chordTask === "identify")) &&
      (s.presentation === "aural" || (s.presentation === "mixed" && Math.random() < 0.5));

    let next: QuizRound | null = null;
    // 错题身份键带模式前缀：专项练习只还原与当前模式一致的题，避免切模式后渲染错配
    const prefix = `${s.mode}:`;
    const keys = (reviewKeysRef.current ?? []).filter((key) => key.startsWith(prefix));
    if (reviewKeysRef.current && keys.length === 0) {
      reviewKeysRef.current = null;
      setReviewKeys(null);
    }
    if (keys.length > 0) {
      const candidates = keys.filter((key) => key !== lastKeyRef.current);
      const pool = candidates.length > 0 ? candidates : keys;
      for (let index = 0; index < 10 && !next; index++) {
        next = roundFromKey(pool[Math.floor(Math.random() * pool.length)], s, auralForReview);
      }
      if (!next) {
        reviewKeysRef.current = null;
        setReviewKeys(null);
      }
    }
    if (!next) next = generateRound(s, progressRef.current, lastMidiRef.current, lastKeyRef.current);

    setRound(next);
    setAttempt((value) => value + 1);
    lastKeyRef.current = next.key;
    lastMidiRef.current = next.question.notes[0]?.midi;
    setPressed([]);
    setPickedOption(null);
    setPickedQuality(null);
    setPickedDegree(null);
    setPickedRhythm(null);
    setDone(false);
    setOk(false);
    setRetry(false);
    doneRef.current = false;
    retryRef.current = false;
    armQuestion(playQuestionSound(next));
  }, [clearTimer, clearPlayback, playQuestionSound, armQuestion]);

  /** 重开当前模式的一组（可顺便改题数），并清空错题专项 */
  const restartSession = useCallback(
    (size?: SessionSize) => {
      reviewKeysRef.current = null;
      setReviewKeys(null);
      // 不传时沿用这一组原本的题数，而不是全局默认设置
      const nextSize = size ?? (sessionRef.current.size as SessionSize);
      updateSession(() => emptySession(nextSize));
      nextQuestion();
    },
    [nextQuestion, updateSession],
  );

  /** 空格/按钮跳题：节流，避免连按把题刷掉；一组结束时改成开新组 */
  const goNext = useCallback(() => {
    const now = Date.now();
    if (now - lastNextRef.current < 220) return;
    lastNextRef.current = now;
    if (sessionRef.current.finished) restartSession();
    else nextQuestion();
  }, [nextQuestion, restartSession]);

  const finish = useCallback(
    (correct: boolean, forcedReactionMs?: number) => {
      if (doneRef.current) return;
      doneRef.current = true;
      setDone(true);
      setOk(correct);
      const s = settingsRef.current;
      const r = roundRef.current;
      const reactionMs =
        forcedReactionMs ??
        (readyAtRef.current > 0 ? Math.max(0, Date.now() - readyAtRef.current) : 0);
      clearTimer();

      const sessionFinished =
        sessionRef.current.size > 0 && sessionRef.current.answered + 1 >= sessionRef.current.size;
      if (!retryRef.current) {
        const group = groupKey(s.mode, s.clef, s.rangeId);
        setProgress((prev) =>
          recordAnswer(prev, group, r.key, correct, { reactionMs, now: Date.now() }),
        );
        updateSession((prev) =>
          recordSessionAnswer(prev, { key: r.key, label: r.label, correct, reactionMs }),
        );
      }
      // 视奏要保留逐音判定结果，等用户手动下一题
      if (s.mode === "sightread" || sessionFinished) return;
      if (correct || !s.wrongManualNext) {
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          nextQuestion();
        }, correct ? 1800 : 2400);
      }
    },
    [clearTimer, nextQuestion, updateSession],
  );

  /** 重听本题：练耳只重弹出题音，其余模式按题目声音重播一遍 */
  const replayAnswer = useCallback(() => {
    stopAllNotes();
    const r = roundRef.current;
    if (r.mode === "ear") {
      playMidi(r.question.notes[0].midi, 1.0, 0.26);
      setQuestionReady(true);
      markReady();
      return;
    }
    const delay = playQuestionSound(r, true);
    if (!doneRef.current && (r.mode === "rhythm" || r.aural)) armQuestion(delay);
  }, [playQuestionSound, armQuestion, markReady]);

  /** 重试本题：保留同一道题，清空作答痕迹，且不再重复计分 */
  const retryQuestion = useCallback(() => {
    clearTimer();
    clearPlayback();
    retryRef.current = true;
    doneRef.current = false;
    setRetry(true);
    setDone(false);
    setOk(false);
    setPressed([]);
    setPickedOption(null);
    setPickedQuality(null);
    setPickedDegree(null);
    setPickedRhythm(null);
    setNotesHidden(false);
    setAttempt((value) => value + 1);
    const r = roundRef.current;
    if (r.mode === "ear") {
      playMidi(r.question.notes[0].midi, 1.0, 0.26);
      armQuestion(0);
    } else {
      armQuestion(playQuestionSound(r));
    }
  }, [clearTimer, clearPlayback, playQuestionSound, armQuestion]);

  const answerNote = useCallback(
    (midi: number) => {
      const s = settingsRef.current;
      const r = roundRef.current;
      if (!questionReady || doneRef.current) return;
      playKey(midi);
      const playable =
        s.mode === "note" || s.mode === "ear" || (s.mode === "chord" && s.chordTask === "play");
      if (!playable) return;
      if (pressed.includes(midi)) return;
      const targets = r.question.notes;
      const isTarget = targets.some((item) => item.midi === midi);
      const next = [...pressed, midi];
      setPressed(next);
      if (!isTarget) {
        finish(false);
        return;
      }
      if (next.length >= targets.length) finish(true);
    },
    [finish, pressed, questionReady],
  );
  answerNoteRef.current = answerNote;

  const answerInterval = useCallback(
    (name: string) => {
      const r = roundRef.current;
      if (doneRef.current || !questionReady || settingsRef.current.mode !== "interval" || !isIntervalQuestion(r.question)) return;
      setPickedOption(name);
      finish(name === r.question.name);
    },
    [finish, questionReady],
  );

  const answerChordQuality = useCallback(
    (id: ChordQualityId) => {
      const r = roundRef.current;
      if (doneRef.current || !questionReady || settingsRef.current.mode !== "chord" || !isChordQuestion(r.question)) return;
      setPickedQuality(id);
      if (!r.question.key) finish(id === r.question.quality);
    },
    [finish, questionReady],
  );

  const answerChordDegree = useCallback(
    (label: string) => {
      const r = roundRef.current;
      if (doneRef.current || !questionReady || settingsRef.current.mode !== "chord" || !isChordQuestion(r.question) || !pickedQuality) return;
      setPickedDegree(label);
      finish(pickedQuality === r.question.quality && label === r.question.degree);
    },
    [finish, pickedQuality, questionReady],
  );

  const answerRhythm = useCallback(
    (id: string) => {
      const r = roundRef.current;
      if (doneRef.current || !questionReady || settingsRef.current.mode !== "rhythm" || !r.rhythm) return;
      setPickedRhythm(id);
      finish(id === r.rhythm.pattern.id);
    },
    [finish, questionReady],
  );

  const answerKey = useCallback(
    (name: string) => {
      const r = roundRef.current;
      if (doneRef.current || !questionReady || settingsRef.current.mode !== "key" || !r.keyQuiz) return;
      setPickedOption(name);
      finish(name === r.keyQuiz.answer);
    },
    [finish, questionReady],
  );

  /** Web MIDI：把键盘按下的音高喂给当前模式的作答回调 */
  const onMidiNote = useCallback((midi: number) => {
    const s = settingsRef.current;
    if (s.mode === "sightread") {
      sightreadPickRef.current?.(midi);
      return;
    }
    if (s.mode === "note" || s.mode === "ear" || (s.mode === "chord" && s.chordTask === "play")) {
      answerNoteRef.current(midi);
    }
  }, []);
  const midiStatus = useMidiInput(settings.midiEnabled, onMidiNote);
  const registerSightreadPick = useCallback((pick: ((midi: number) => void) | null) => {
    sightreadPickRef.current = pick;
  }, []);

  // 影响出题的设置变化时重新出题（首次挂载沿用首屏生成的题，避免闪换）
  const settingsKey = questionSeed(settings);
  const prevSettingsRef = useRef(settingsKey);
  useEffect(() => {
    if (prevSettingsRef.current === settingsKey) return;
    prevSettingsRef.current = settingsKey;
    nextQuestion();
    return clearTimer;
  }, [settingsKey, nextQuestion, clearTimer]);

  // 从辅助视图切回训练时重新起算反应时长，避免把离开页面的时间记进成绩
  const prevViewRef = useRef<View>(view);
  useEffect(() => {
    if (prevViewRef.current === view) return;
    prevViewRef.current = view;
    if (view === "train") readyAtRef.current = Date.now();
  }, [view]);

  // 音符显示时长：到时间先隐藏（练瞬时记忆），作答揭晓后重新显示
  const hideAfter = useMemo(() => {
    const seconds = Number.parseFloat(settings.showDuration);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
  }, [settings.showDuration]);

  useEffect(() => {
    setNotesHidden(false);
    if (done || settings.mode !== "note" || hideAfter <= 0) return;
    const timer = window.setTimeout(() => setNotesHidden(true), hideAfter);
    return () => window.clearTimeout(timer);
  }, [done, settings.mode, hideAfter, round]);

  /** 键盘显示区：按题目最低/最高音所在八度组展开 */
  const keyboardSpan = useMemo<[number, number]>(() => {
    const midis = round.question.notes.map((item) => item.midi);
    const lo = octaveGroupRoot(Math.min(...midis));
    const hi = octaveGroupRoot(Math.max(...midis)) + 11;
    return [lo, hi];
  }, [round]);

  const scratchAnchor = useMemo(
    () => octaveGroupRoot(Math.min(...round.question.notes.map((item) => item.midi))),
    [round],
  );
  const showScratchKeyboard =
    !round.aural &&
    (settings.mode === "interval" || (settings.mode === "chord" && settings.chordTask === "identify"));

  handlerRef.current = (event: KeyboardEvent) => {
    if (view !== "train") return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    const key = event.key.toLowerCase();
    if (key === " " || key === "enter") {
      event.preventDefault();
      goNext();
      return;
    }
    const s = settingsRef.current;
    if (key >= "1" && key <= "9") {
      const index = Number(key) - 1;
      let option: string | null = null;
      let action: ((value: string) => void) | null = null;
      if (s.mode === "interval") {
        option = roundRef.current.options[index] ?? null;
        action = answerInterval;
      } else if (s.mode === "rhythm" && roundRef.current.rhythm) {
        option = roundRef.current.rhythm.options[index]?.id ?? null;
        action = answerRhythm;
      } else if (s.mode === "key" && roundRef.current.keyQuiz) {
        option = roundRef.current.keyQuiz.options[index] ?? null;
        action = answerKey;
      } else if (s.mode === "chord" && s.chordTask === "identify") {
        if (!pickedQuality) {
          const id = roundRef.current.qualityOptions[index];
          if (id) {
            event.preventDefault();
            answerChordQuality(id);
          }
        } else {
          const label = roundRef.current.degreeOptions[index];
          if (label) {
            event.preventDefault();
            answerChordDegree(label);
          }
        }
        return;
      }
      if (option && action) {
        event.preventDefault();
        action(option);
        return;
      }
    }
    const pc = KEY_HINTS[key];
    if (pc !== undefined) {
      if (s.mode === "sightread") {
        const expected = roundRef.current.sightread?.notes.find((item) => pcOf(item.midi) === pc);
        sightreadPickRef.current?.(expected?.midi ?? 60 + pc);
        event.preventDefault();
        return;
      }
      const playable =
        s.mode === "note" || s.mode === "ear" || (s.mode === "chord" && s.chordTask === "play");
      if (!playable) return;
      event.preventDefault();
      const nextTarget = roundRef.current.question.notes
        .map((item) => item.midi)
        .find((midi) => !pressed.includes(midi) && pcOf(midi) === pc);
      answerNote(shortcutMidi(pc, keyboardSpan[0], keyboardSpan[1], nextTarget));
    }
  };

  useEffect(() => {
    const listener = (event: KeyboardEvent) => handlerRef.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const currentGroup = groupKey(settings.mode, settings.clef, settings.rangeId);
  const currentStats = statsOf(progress, currentGroup);
  const weaknessRows = useMemo(
    () => topWeaknesses(progress, 5, settings.weaknessSort, settings.mode),
    [progress, settings.weaknessSort, settings.mode],
  );
  const reactions = useMemo(
    () => reactionSummary(progress, 3, settings.mode),
    [progress, settings.mode],
  );
  const sessionSummary = useMemo(() => summarizeSession(session), [session]);
  const accuracy =
    currentStats.total > 0 ? Math.round((currentStats.correct / currentStats.total) * 100) : 0;

  const groupLabel = useMemo(() => {
    if (settings.mode === "ear") return "练耳 · C4–B4";
    if (settings.mode === "rhythm") return `节奏 · ${settings.meter} · ${settings.bpm} BPM`;
    if (settings.mode === "sightread") return `视奏 · ${settings.meter} · ${settings.bpm} BPM`;
    if (settings.mode === "key") return "认调号 · 大调 / 小调";
    return `${MODE_LABELS[settings.mode]} · ${CLEF_LABELS[settings.clef]} · ${range.label.split("（")[0]}`;
  }, [settings, range]);

  const question = round.question;
  const revealed = done;
  const interval = isIntervalQuestion(question) ? question : null;
  const chord = settings.mode === "chord" && isChordQuestion(question) ? question : null;
  const tonicPc = settings.chordRootPc;
  const noteNames = question.notes.map((note) => noteLabel(note, settings.noteLabelMode, tonicPc));
  const labelFor = useCallback(
    (midi: number) => midiLabelFor(midi, settings.noteLabelMode, tonicPc),
    [settings.noteLabelMode, tonicPc],
  );

  const isSightread = settings.mode === "sightread";
  const isEar = settings.mode === "ear";
  const isRhythm = settings.mode === "rhythm";
  const isKey = settings.mode === "key";
  const isChordPlay = settings.mode === "chord" && settings.chordTask === "play";
  const isListenCard = isEar || isRhythm || round.aural;

  const idleText = (() => {
    if (isEar) {
      return questionReady
        ? "听音后在钢琴键盘上弹出你听到的音，可点「再听一次」重播"
        : "正在播放引导音… 请仔细听";
    }
    if (isRhythm) return questionReady ? "听一小节节奏，选出对应的时值组合" : "正在播放节奏… 请仔细听";
    if (isKey) return "看谱号后面的升降记号，选出对应的调名";
    if (round.aural) {
      return questionReady
        ? settings.mode === "interval"
          ? "听刚才的两个音，选择构成的音程"
          : "听刚才的和弦，选择性质"
        : "正在播放题目音… 请仔细听";
    }
    if (settings.mode === "interval") return "看谱后在下方选择两个音构成的音程";
    if (settings.mode === "chord") {
      if (settings.chordTask === "play") return "看标记，在钢琴键盘上弹出该和弦的音（顺序不限）";
      return settings.chordDiatonic ? "看谱后先选和弦性质，再选调内级数" : "看谱后选择和弦性质";
    }
    const action = settings.noteCount === 1 ? "在下方钢琴键盘上作答" : `弹出全部 ${settings.noteCount} 个音（顺序不限）`;
    return notesHidden ? `谱面已隐藏，凭记忆${action}` : `看谱后${action}`;
  })();

  const resultText = (() => {
    if (isRhythm && round.rhythm) {
      const answer = round.rhythm.pattern.description;
      return ok ? `回答正确：${answer}` : `答错了，正确答案是 ${answer}`;
    }
    if (isKey && round.keyQuiz) {
      return ok ? `回答正确：${round.keyQuiz.answer}` : `答错了，正确答案是 ${round.keyQuiz.answer}`;
    }
    if (settings.mode === "interval" && interval) {
      const pair = `${noteNames[0]} → ${noteNames[1]}`;
      return ok ? `回答正确：${pair} 是 ${interval.name}` : `答错了，正确答案是 ${interval.name}（${pair}）`;
    }
    if (settings.mode === "chord" && chord) {
      if (settings.chordTask === "play") {
        const answer = `${chordAnswerText(chord)}，音：${noteNames.join(" ")}`;
        return ok ? `回答正确：${answer}` : `答错了，正确答案是 ${answer}`;
      }
      const detail = chordAnswerText(chord);
      const answer = chord.key ? `${chord.qualityName} · ${detail}` : detail;
      return ok ? `回答正确：${answer}` : `答错了，正确答案是 ${answer}`;
    }
    const answer =
      noteNames.length === 1
        ? `${noteNames[0]} · ${noteLabel(question.notes[0], "solfege", tonicPc)}`
        : noteNames.join(" → ");
    return ok ? `回答正确：${answer}` : `答错了，正确答案是 ${answer}`;
  })();

  const shortcutHint = (() => {
    if (isSightread) return "快捷键：白键 A S D F G H J，黑键 W E T Y U，空格跳过。";
    if (settings.mode === "interval" || isRhythm || isKey || (settings.mode === "chord" && settings.chordTask === "identify")) {
      return "快捷键：选项 1 2 3 4，空格跳到下一题。";
    }
    return "快捷键：白键 A S D F G H J，黑键 W E T Y U，空格跳到下一题。";
  })();

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-3 sm:px-4 sm:py-4">
          <div className="flex shrink-0 items-baseline gap-3">
            <h1 className="text-xl font-semibold tracking-tight">识谱训练</h1>
            <p className="hidden text-sm text-muted-foreground sm:block">五线谱视奏练习</p>
          </div>
          <nav
            aria-label="训练模式"
            className="-mx-3 flex w-full items-center gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
          >
            {MODE_BUTTONS.map((item) => (
              <Button
                key={item.mode}
                size="sm"
                className="shrink-0 whitespace-nowrap"
                variant={settings.mode === item.mode && view === "train" ? "default" : "outline"}
                onClick={() => {
                  stopAllNotes();
                  setView("train");
                  updateSettings({ mode: item.mode });
                }}
              >
                {item.mode === "ear" && <Headphones className="mr-1 size-4" />}
                {item.label}
              </Button>
            ))}
            <Button
              size="sm"
              className="shrink-0 whitespace-nowrap"
              variant={view === "phrase" ? "default" : "outline"}
              onClick={() => { stopAllNotes(); setView((value) => (value === "phrase" ? "train" : "phrase")); }}
            >
              乐句视唱
            </Button>
            <Button
              size="sm"
              className="shrink-0 whitespace-nowrap"
              variant={view === "free" ? "default" : "outline"}
              onClick={() => { stopAllNotes(); setView((value) => (value === "free" ? "train" : "free")); }}
            >
              自由演奏
            </Button>
            <Button
              size="sm"
              className="shrink-0 whitespace-nowrap"
              variant={metronomeOpen ? "default" : "outline"}
              onClick={() => setMetronomeOpen((value) => !value)}
            >
              <Timer className="mr-1 size-4" />
              节拍器
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-3 py-4 sm:px-4 sm:py-6">
        {view === "free" ? (
          <Card>
            <CardContent className="py-5"><FreePlay /></CardContent>
          </Card>
        ) : view === "phrase" ? (
          <Suspense fallback={<SheetFallback />}>
            <PhrasePractice
              bpm={settings.bpm}
              onBpmChange={(value) => updateSettings({ bpm: value })}
              meter={settings.meter}
              onMeterChange={(value) => updateSettings({ meter: value })}
              metronomeVolume={settings.metronomeVolume}
              bars={settings.phraseBars}
              onBarsChange={(value) => updateSettings({ phraseBars: value })}
              keyMode={settings.phraseKeyMode}
              onKeyModeChange={(value) => updateSettings({ phraseKeyMode: value })}
              rootPc={settings.phraseRootPc}
              onRootPcChange={(value) => updateSettings({ phraseRootPc: value })}
              countIn={settings.countIn}
              onCountInChange={(value) => updateSettings({ countIn: value })}
            />
          </Suspense>
        ) : (
          <>
            <Card>
              <CardContent className="py-5">
                <SettingsPanel settings={settings} onChange={updateSettings} midiStatus={midiStatus} />
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-[1fr_272px]">
              <div className="space-y-4">
                {reviewKeys && (
                  <Card className="border-amber-400/60 bg-amber-50">
                    <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                      <span className="font-medium text-amber-800">错题专项 · 本组 {reviewKeys.length} 题，连续练习中</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          reviewKeysRef.current = null;
                          setReviewKeys(null);
                          nextQuestion();
                        }}
                      >
                        退出专项
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {isSightread && round.sightread ? (
                  <Suspense fallback={<SheetFallback />}>
                    <SightReadPractice
                      key={`${round.key}-${attempt}`}
                      question={round.sightread}
                      countIn={settings.countIn}
                      metronomeVolume={settings.metronomeVolume}
                      labelFor={labelFor}
                      registerPick={registerSightreadPick}
                      onFinish={(correct) => finish(correct, 0)}
                    />
                  </Suspense>
                ) : (
                  <>
                    {isListenCard ? (
                      <Card className="flex min-h-[220px] flex-col items-center justify-center gap-3">
                        <span className="text-7xl font-bold leading-none text-muted-foreground/60">
                          {isRhythm ? "♪" : "？"}
                        </span>
                        <p className="text-sm text-muted-foreground">
                          {questionReady
                            ? isRhythm
                              ? "刚才听到的是哪一条节奏？"
                              : "刚才听到的音是哪个？"
                            : "正在播放… 请仔细听"}
                        </p>
                        {questionReady && !revealed && (
                          <Button size="sm" variant="ghost" onClick={replayAnswer} aria-label="再听一次">
                            <Volume2 className="mr-1 size-3.5" />
                            再听一次
                          </Button>
                        )}
                      </Card>
                    ) : isKey ? (
                      <Suspense fallback={<SheetFallback />}>
                        <StaffSheet
                          clef="treble"
                          range={RANGES.treble[0]}
                          staff="treble"
                          notes={[]}
                          layout="chord"
                          hidden
                          keySignature={round.keySignature}
                        />
                      </Suspense>
                    ) : isChordPlay && chord ? (
                      <Card className="flex min-h-[220px] flex-col items-center justify-center gap-3">
                        <span className="text-5xl font-bold tracking-wide">{chord.symbol}</span>
                        <p className="text-sm text-muted-foreground">{chordPromptDesc(chord)}</p>
                      </Card>
                    ) : (
                      <Suspense fallback={<SheetFallback />}>
                        <StaffSheet
                          clef={settings.clef}
                          range={range}
                          staff={question.staff}
                          notes={question.notes}
                          layout={question.layout}
                          hidden={notesHidden}
                          keySignature={round.keySignature}
                          highlight={revealed}
                        />
                      </Suspense>
                    )}

                    <Card
                      className={
                        !revealed
                          ? "border-dashed"
                          : ok
                            ? "border-emerald-500/60 bg-emerald-50"
                            : "border-red-500/60 bg-red-50"
                      }
                    >
                      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                        <div className="flex items-center gap-2 text-sm">
                          {!revealed ? (
                            <>
                              <Circle className="size-4 shrink-0 text-muted-foreground" />
                              <span className="text-muted-foreground">{idleText}</span>
                            </>
                          ) : ok ? (
                            <>
                              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                              <span className="font-medium text-emerald-700">
                                {resultText}
                                {retry && <span className="ml-1 text-xs font-normal text-muted-foreground">（重试不计分）</span>}
                              </span>
                            </>
                          ) : (
                            <>
                              <XCircle className="size-4 shrink-0 text-red-600" />
                              <span className="font-medium text-red-700">
                                {resultText}
                                {retry && <span className="ml-1 text-xs font-normal text-muted-foreground">（重试不计分）</span>}
                                {!retry && settings.wrongManualNext && (
                                  <span className="ml-1 text-xs font-normal text-muted-foreground">（已停在本题，可重听或重试）</span>
                                )}
                              </span>
                            </>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {revealed && (
                            <Button size="sm" variant="ghost" onClick={replayAnswer} aria-label="重听答案">
                              <Volume2 className="mr-1 size-3.5" />
                              重听答案
                            </Button>
                          )}
                          {revealed && !ok && (
                            <Button size="sm" variant="ghost" onClick={retryQuestion} aria-label="重试本题">
                              <RotateCw className="mr-1 size-3.5" />
                              重试本题
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={goNext}>
                            {session.finished ? "再来一组" : "下一题"}
                            <kbd className="ml-1 text-xs text-muted-foreground">空格</kbd>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="pt-5">
                        {settings.mode === "note" || isEar || isChordPlay ? (
                          <PianoKeyboard
                            targets={question.notes.map((item) => item.midi)}
                            pressed={pressed}
                            span={keyboardSpan}
                            revealed={revealed}
                            labelFor={labelFor}
                            onPick={answerNote}
                          />
                        ) : settings.mode === "interval" && interval ? (
                          <IntervalOptions
                            options={round.options}
                            correct={interval.name}
                            picked={pickedOption}
                            revealed={revealed}
                            onPick={answerInterval}
                          />
                        ) : settings.mode === "chord" && chord ? (
                          <ChordOptions
                            qualityOptions={round.qualityOptions}
                            degreeOptions={round.degreeOptions}
                            correctQuality={chord.quality}
                            correctDegree={chord.degree}
                            pickedQuality={pickedQuality}
                            pickedDegree={pickedDegree}
                            showDegree={!!chord.key}
                            revealed={revealed}
                            onPickQuality={answerChordQuality}
                            onPickDegree={answerChordDegree}
                          />
                        ) : isRhythm && round.rhythm ? (
                          <RhythmOptions
                            options={round.rhythm.options}
                            correctId={round.rhythm.pattern.id}
                            pickedId={pickedRhythm}
                            revealed={revealed}
                            onPick={answerRhythm}
                          />
                        ) : isKey && round.keyQuiz ? (
                          <IntervalOptions
                            options={round.keyQuiz.options}
                            correct={round.keyQuiz.answer}
                            picked={pickedOption}
                            revealed={revealed}
                            onPick={answerKey}
                            groupLabel="调名选项"
                            answerLabel="正确调名"
                          />
                        ) : null}
                      </CardContent>
                    </Card>

                    {showScratchKeyboard && (
                      <Card>
                        <CardContent className="pt-5">
                          <ScratchKeyboard
                            anchor={scratchAnchor}
                            targets={question.notes.map((item) => item.midi)}
                            revealed={revealed}
                          />
                        </CardContent>
                      </Card>
                    )}
                  </>
                )}
              </div>

              <div className="space-y-4">
                <SessionPanel
                  session={session}
                  summary={sessionSummary}
                  scopeLabel={MODE_LABELS[settings.mode]}
                  onRestart={() => restartSession()}
                  onReviewWrong={() => {
                    const keys = summarizeSession(sessionRef.current).wrongKeys;
                    if (keys.length === 0) return;
                    reviewKeysRef.current = keys;
                    setReviewKeys(keys);
                    updateSession(() => emptySession(0));
                    nextQuestion();
                  }}
                  onSizeChange={(size) => {
                    updateSettings({ sessionSize: size });
                    restartSession(size);
                  }}
                />

                <Card>
                  <CardContent className="space-y-4 py-5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="text-sm font-medium text-muted-foreground">当前配置成绩</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">{groupLabel}</p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 shrink-0"
                        onClick={() => setProgress((prev) => resetGroup(prev, currentGroup))}
                        aria-label="重置当前配置成绩"
                        title="重置当前配置成绩"
                      >
                        <RotateCcw className="size-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Stat label="题数" value={String(currentStats.total)} />
                      <Stat label="正确率" value={`${accuracy}%`} />
                      <Stat label="连击" value={String(currentStats.streak)} />
                      <Stat label="最佳连击" value={String(currentStats.best)} />
                    </div>

                    <div className="space-y-2 border-t pt-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-medium text-muted-foreground">反应时长</h3>
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          最近 {reactions.count} 次
                        </span>
                      </div>
                      {reactions.count === 0 ? (
                        <p className="text-xs text-muted-foreground">作答后会记录平均反应与最慢的音</p>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                            <span className="text-muted-foreground">平均</span>
                            <span className="text-right font-medium tabular-nums">{formatMs(reactions.avgMs)}</span>
                            <span className="text-muted-foreground">中位数</span>
                            <span className="text-right font-medium tabular-nums">{formatMs(reactions.medianMs)}</span>
                          </div>
                          <ul className="space-y-1">
                            {reactions.slowest.map((item) => (
                              <li key={item.key} className="flex justify-between gap-2 text-xs">
                                <span className="truncate text-muted-foreground">{item.label}</span>
                                <span className="shrink-0 tabular-nums">{formatMs(item.ms)}</span>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>

                    <div className="space-y-2 border-t pt-3">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <h3 className="text-xs font-medium text-muted-foreground">易错 TOP 5</h3>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant={settings.weaknessSort === "wrong" ? "default" : "ghost"}
                            className="h-6 px-1.5 text-[11px]"
                            onClick={() => updateSettings({ weaknessSort: "wrong" })}
                          >
                            按错次
                          </Button>
                          <Button
                            size="sm"
                            variant={settings.weaknessSort === "slow" ? "default" : "ghost"}
                            className="h-6 px-1.5 text-[11px]"
                            onClick={() => updateSettings({ weaknessSort: "slow" })}
                          >
                            按反应慢
                          </Button>
                        </div>
                      </div>
                      {weaknessRows.length === 0 ? (
                        <p className="text-xs text-muted-foreground">还没有错题，答错的题会出现在这里</p>
                      ) : (
                        <ul className="space-y-1">
                          {weaknessRows.map((row) => (
                            <li
                              key={row.key}
                              className="flex items-center justify-between gap-2 rounded-md bg-muted px-2 py-1 text-xs"
                              title={row.key}
                            >
                              <span className="truncate">{row.label}</span>
                              <span className="shrink-0 tabular-nums text-muted-foreground">
                                {settings.weaknessSort === "slow" ? formatMs(row.reactionMs) : `错 ${row.wrong} / ${row.seen}`}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {(weaknessRows.length > 0 || reactions.count > 0) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1.5 text-xs"
                          onClick={() => setProgress((prev) => clearWeakness(prev, settings.mode))}
                        >
                          清空本模式错题与反应记录
                        </Button>
                      )}
                    </div>

                    <div className="space-y-2 border-t pt-3">
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="wrong-manual-next" className="text-xs leading-tight">答错时手动下一题</Label>
                        <Switch
                          id="wrong-manual-next"
                          checked={settings.wrongManualNext}
                          onCheckedChange={(value) => updateSettings({ wrongManualNext: value })}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="focus-weak" className="text-xs leading-tight">只练错过的题</Label>
                        <Switch
                          id="focus-weak"
                          checked={settings.focusWeak}
                          onCheckedChange={(value) => updateSettings({ focusWeak: value })}
                        />
                      </div>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        出题按错题次数与复习到期时间加权；答对后间隔复习，到期会重新出现。
                      </p>
                    </div>

                    <div className="rounded-md bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                      {shortcutHint}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
      </main>

      <Metronome
        open={metronomeOpen}
        onClose={() => setMetronomeOpen(false)}
        bpm={settings.bpm}
        onBpmChange={(value) => updateSettings({ bpm: value })}
        meter={settings.meter}
        volume={settings.metronomeVolume}
        onVolumeChange={(value) => updateSettings({ metronomeVolume: value })}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
