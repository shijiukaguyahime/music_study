import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Circle, Headphones, RotateCcw, Timer, XCircle } from "lucide-react";
import { IntervalOptions } from "@/components/IntervalOptions";
import { Metronome } from "@/components/Metronome";
import { PianoKeyboard } from "@/components/PianoKeyboard";
import { SettingsPanel, type TrainMode } from "@/components/SettingsPanel";
import { StaffSheet } from "@/components/StaffSheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAudioContext, playKey, playMidi, preloadPiano, stopAllNotes } from "@/lib/audio";
import {
  DEFAULT_RANGE,
  EAR_GUIDE,
  EAR_GUIDE_TOTAL,
  KEY_HINTS,
  RANGES,
  generateChord,
  generateEarNote,
  generateInterval,
  intervalOptions,
  noteName,
  octaveGroupRoot,
  shortcutMidi,
  solfege,
  type Clef,
  type IntervalQuestion,
  type Question,
} from "@/lib/music/theory";

interface Stats {
  total: number;
  correct: number;
  streak: number;
  best: number;
}

const EMPTY_STATS: Stats = { total: 0, correct: 0, streak: 0, best: 0 };

function isIntervalQuestion(question: Question): question is IntervalQuestion {
  return "name" in question;
}

const DEFAULT_CLEF: Clef = "treble";
const DEFAULT_NOTE_COUNT = 1;

interface RoundState {
  question: Question;
  options: string[];
  pressed: number[];
  pickedOption: string | null;
  done: boolean;
  ok: boolean;
}

function createInitialRound(): RoundState {
  const range = RANGES[DEFAULT_CLEF].find((item) => item.id === DEFAULT_RANGE[DEFAULT_CLEF]) ?? RANGES[DEFAULT_CLEF][0];
  return {
    question: generateChord(range, DEFAULT_CLEF, false, DEFAULT_NOTE_COUNT),
    options: [],
    pressed: [],
    pickedOption: null,
    done: false,
    ok: false,
  };
}

export default function App() {
  const [initial] = useState<RoundState>(createInitialRound);
  const [mode, setMode] = useState<TrainMode>("note");
  const [clef, setClef] = useState<Clef>(DEFAULT_CLEF);
  const [rangeId, setRangeId] = useState(DEFAULT_RANGE[DEFAULT_CLEF]);
  const [allowAccidentals, setAllowAccidentals] = useState(false);
  const [noteCount, setNoteCount] = useState(DEFAULT_NOTE_COUNT);
  const [showDuration, setShowDuration] = useState("");
  const [notesHidden, setNotesHidden] = useState(false);
  const [metronomeOpen, setMetronomeOpen] = useState(false);
  const [earGuide, setEarGuide] = useState(true);
  /** 练耳：引导音/出题音还在播放时为 false，播放期间不接受作答 */
  const [questionReady, setQuestionReady] = useState(true);

  const [question, setQuestion] = useState<Question>(initial.question);
  const [options, setOptions] = useState<string[]>(initial.options);
  const [pressed, setPressed] = useState<number[]>(initial.pressed);
  const [pickedOption, setPickedOption] = useState<string | null>(initial.pickedOption);
  const [done, setDone] = useState(initial.done);
  const [ok, setOk] = useState(initial.ok);
  const [stats, setStats] = useState<Record<TrainMode, Stats>>({
    note: EMPTY_STATS,
    interval: EMPTY_STATS,
    ear: EMPTY_STATS,
  });

  const timerRef = useRef<number | null>(null);
  /** 练耳：正在排程的播放定时器，换题/切模式时清掉 */
  const playbackTimersRef = useRef<number[]>([]);
  const lastMidiRef = useRef<number | undefined>(initial.question.notes[0]?.midi);

  const range = useMemo(
    () => RANGES[clef].find((item) => item.id === rangeId) ?? RANGES[clef][0],
    [clef, rangeId],
  );

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearPlayback = useCallback(() => {
    playbackTimersRef.current.forEach((id) => window.clearTimeout(id));
    playbackTimersRef.current = [];
    stopAllNotes();
  }, []);

  // 卸载时停掉还在排程的播放
  useEffect(() => () => clearPlayback(), [clearPlayback]);

  /** 练耳：按 EAR_GUIDE_BPM 节奏一次性排好引导音，出题音在引导结束后响起即可作答 */
  const startEarPlayback = useCallback(
    (midi: number) => {
      clearPlayback();
      setQuestionReady(false);
      const ctx = getAudioContext();
      const base = ctx ? ctx.currentTime : 0;
      const answerAt = earGuide ? EAR_GUIDE_TOTAL : 0;
      if (earGuide) {
        for (const note of EAR_GUIDE) playMidi(note.midi, note.duration, 0.24, base + note.time);
      }
      playMidi(midi, 1.0, 0.26, base + answerAt);
      playbackTimersRef.current = [window.setTimeout(() => setQuestionReady(true), answerAt * 1000 + 80)];
    },
    [clearPlayback, earGuide],
  );

  // 启动即预载钢琴采样（失败时播放自动退回合成音）
  useEffect(() => {
    void preloadPiano();
  }, []);

  const nextQuestion = useCallback(() => {
    clearTimer();
    clearPlayback();
    if (mode === "ear") {
      const generated = generateEarNote(allowAccidentals, lastMidiRef.current);
      setQuestion(generated);
      lastMidiRef.current = generated.notes[0].midi;
      startEarPlayback(generated.notes[0].midi);
    } else {
      setQuestionReady(true);
      if (mode === "interval") {
        const generated = generateInterval(range, clef, allowAccidentals);
        setQuestion(generated);
        setOptions(intervalOptions(generated.name, allowAccidentals));
        lastMidiRef.current = generated.lower.midi;
      } else {
        const generated = generateChord(range, clef, allowAccidentals, noteCount, lastMidiRef.current);
        setQuestion(generated);
        lastMidiRef.current = generated.notes[0].midi;
      }
    }
    setPressed([]);
    setPickedOption(null);
    setDone(false);
    setOk(false);
  }, [allowAccidentals, clearPlayback, clearTimer, clef, mode, noteCount, range, startEarPlayback]);

  const finish = useCallback(
    (correct: boolean) => {
      setDone(true);
      setOk(correct);
      setStats((prev) => {
        const current = prev[mode];
        const streak = correct ? current.streak + 1 : 0;
        const next: Record<TrainMode, Stats> = { ...prev };
        next[mode] = {
          total: current.total + 1,
          correct: current.correct + (correct ? 1 : 0),
          streak,
          best: Math.max(current.best, streak),
        };
        return next;
      });
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        nextQuestion();
      }, 1800);
    },
    [clearTimer, mode, nextQuestion],
  );

  const answerNote = useCallback(
    (midi: number) => {
      // 引导音/出题音还在播时忽略作答（不判定也不出声）
      if (mode === "ear" && (done || !questionReady)) return;
      playKey(midi);
      if (done || (mode !== "note" && mode !== "ear")) return;
      const expected = question.notes[pressed.length]?.midi;
      if (expected === undefined) return;
      if (midi === expected) {
        const next = [...pressed, midi];
        setPressed(next);
        if (next.length >= question.notes.length) finish(true);
      } else {
        setPressed([...pressed, midi]);
        finish(false);
      }
    },
    [done, finish, mode, pressed, question, questionReady],
  );

  const answerInterval = useCallback(
    (name: string) => {
      if (done || mode !== "interval" || !isIntervalQuestion(question)) return;
      setPickedOption(name);
      finish(name === question.name);
    },
    [done, finish, mode, question],
  );

  const goNext = useCallback(() => nextQuestion(), [nextQuestion]);

  // 设置变化时重新出题（首次挂载沿用 createInitialRound 的题，避免闪换）
  const settingsKey = `${mode}|${clef}|${rangeId}|${allowAccidentals}|${noteCount}|${earGuide}`;
  const prevSettingsRef = useRef(settingsKey);
  useEffect(() => {
    if (prevSettingsRef.current === settingsKey) return;
    prevSettingsRef.current = settingsKey;
    nextQuestion();
    return clearTimer;
  }, [settingsKey, nextQuestion, clearTimer]);

  // 音符显示时长：到时间先隐藏（练瞬时记忆），作答揭晓后重新显示
  const hideAfter = useMemo(() => {
    const seconds = Number.parseFloat(showDuration);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
  }, [showDuration]);

  useEffect(() => {
    setNotesHidden(false);
    if (done || mode !== "note" || hideAfter <= 0) return;
    const timer = window.setTimeout(() => setNotesHidden(true), hideAfter);
    return () => window.clearTimeout(timer);
  }, [done, mode, hideAfter, question]);

  /** 键盘显示区：按题目最低/最高音所在八度组展开（单音一个组，跨组则两组并排；练耳题恒 C4 组） */
  const keyboardSpan = useMemo<[number, number]>(() => {
    const midis = question.notes.map((item) => item.midi);
    const lo = octaveGroupRoot(Math.min(...midis));
    const hi = octaveGroupRoot(Math.max(...midis)) + 11;
    return [lo, hi];
  }, [question]);

  const handlerRef = useRef<(event: KeyboardEvent) => void>(() => {});
  handlerRef.current = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    const key = event.key.toLowerCase();
    if (key === " " || key === "enter") {
      event.preventDefault();
      goNext();
      return;
    }
    if (mode === "interval" && key >= "1" && key <= "4") {
      const option = options[Number(key) - 1];
      if (option) {
        event.preventDefault();
        answerInterval(option);
      }
      return;
    }
    const pc = KEY_HINTS[key];
    if (pc !== undefined) {
      event.preventDefault();
      // 屏上有两个同音级键时自动对齐待答音的八度
      answerNote(shortcutMidi(pc, keyboardSpan[0], keyboardSpan[1], question.notes[pressed.length]?.midi));
    }
  };

  useEffect(() => {
    const listener = (event: KeyboardEvent) => handlerRef.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const currentStats = stats[mode];
  const revealed = done;
  const interval = isIntervalQuestion(question) ? question : null;
  const noteNames = question.notes.map(noteName);
  const accuracy =
    currentStats.total > 0 ? Math.round((currentStats.correct / currentStats.total) * 100) : 0;

  const idleText = (() => {
    if (mode === "ear") {
      return questionReady ? "听音后在钢琴键盘上弹出你听到的音" : "正在播放引导音… 请仔细听";
    }
    if (mode === "interval") return "看谱后在下方选择两个音构成的音程";
    const action = noteCount === 1 ? "在下方钢琴键盘上作答" : `按从低到高依次按下 ${noteCount} 个音`;
    return notesHidden ? `谱面已隐藏，凭记忆${action}` : `看谱后${action}`;
  })();

  const resultText = (() => {
    if (mode === "interval" && interval) {
      const pair = `${noteName(interval.lower)} → ${noteName(interval.upper)}`;
      return ok ? `回答正确：${pair} 是 ${interval.name}` : `答错了，正确答案是 ${interval.name}（${pair}）`;
    }
    const answer =
      noteNames.length === 1
        ? `${noteNames[0]} · ${solfege(question.notes[0])}`
        : noteNames.join(" → ");
    return ok ? `回答正确：${answer}` : `答错了，正确答案是 ${answer}`;
  })();

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-baseline gap-3">
            <h1 className="text-xl font-semibold tracking-tight">识谱训练</h1>
            <p className="text-sm text-muted-foreground">五线谱视奏练习</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={mode === "note" ? "default" : "outline"}
              onClick={() => setMode("note")}
            >
              单音训练
            </Button>
            <Button
              size="sm"
              variant={mode === "interval" ? "default" : "outline"}
              onClick={() => setMode("interval")}
            >
              音程训练
            </Button>
            <Button
              size="sm"
              variant={mode === "ear" ? "default" : "outline"}
              onClick={() => setMode("ear")}
            >
              <Headphones className="mr-1 size-4" />
              练耳训练
            </Button>
            <Button size="sm" variant="ghost" disabled>
              乐句训练
              <Badge variant="secondary" className="ml-2">
                即将上线
              </Badge>
            </Button>
            <Button
              size="sm"
              variant={metronomeOpen ? "default" : "outline"}
              onClick={() => setMetronomeOpen((value) => !value)}
            >
              <Timer className="mr-1 size-4" />
              节拍器
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
        <Card>
          <CardContent className="py-5">
            <SettingsPanel
              mode={mode}
              clef={clef}
              rangeId={range.id}
              allowAccidentals={allowAccidentals}
              noteCount={noteCount}
              showDuration={showDuration}
              earGuide={earGuide}
              onClefChange={setClef}
              onRangeChange={setRangeId}
              onAccidentalsChange={setAllowAccidentals}
              onNoteCountChange={setNoteCount}
              onShowDurationChange={setShowDuration}
              onEarGuideChange={setEarGuide}
            />
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <div className="space-y-4">
            {mode === "ear" ? (
              <Card className="flex min-h-[220px] flex-col items-center justify-center gap-3">
                <span className="text-7xl font-bold leading-none text-muted-foreground/60">？</span>
                <p className="text-sm text-muted-foreground">
                  {questionReady ? "刚才听到的音是哪个？" : "正在播放…"}
                </p>
              </Card>
            ) : (
              <StaffSheet
                clef={clef}
                range={range}
                staff={question.staff}
                notes={question.notes}
                layout={question.layout}
                hidden={notesHidden}
              />
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
                      <Circle className="size-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{idleText}</span>
                    </>
                  ) : ok ? (
                    <>
                      <CheckCircle2 className="size-4 text-emerald-600" />
                      <span className="font-medium text-emerald-700">{resultText}</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="size-4 text-red-600" />
                      <span className="font-medium text-red-700">{resultText}</span>
                    </>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={goNext}>
                  下一题 <kbd className="ml-1 text-xs text-muted-foreground">空格</kbd>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5">
                {mode === "note" || mode === "ear" ? (
                  <PianoKeyboard
                    targets={question.notes.map((item) => item.midi)}
                    pressed={pressed}
                    span={keyboardSpan}
                    revealed={revealed}
                    onPick={answerNote}
                  />
                ) : interval ? (
                  <IntervalOptions
                    options={options}
                    correct={interval.name}
                    picked={pickedOption}
                    revealed={revealed}
                    onPick={answerInterval}
                  />
                ) : null}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardContent className="space-y-4 py-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-muted-foreground">本次成绩</h2>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() =>
                      setStats((prev) => {
                        const next: Record<TrainMode, Stats> = { ...prev };
                        next[mode] = EMPTY_STATS;
                        return next;
                      })
                    }
                    aria-label="重置成绩"
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
                <div className="rounded-md bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                  {mode === "interval"
                    ? "快捷键：选项 1 2 3 4，空格跳到下一题。"
                    : "快捷键：白键 A S D F G H J，黑键 W E T Y U，空格跳到下一题。"}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <Metronome open={metronomeOpen} onClose={() => setMetronomeOpen(false)} />
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
