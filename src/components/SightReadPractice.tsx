import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Play, RotateCcw, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PhraseSheet } from "@/components/PhraseSheet";
import { PianoKeyboard } from "@/components/PianoKeyboard";
import { getAudioContext, playMidi, playKey, scheduleClick, stopAllNotes } from "@/lib/audio";
import { hitWindowSec, type SightReadQuestion } from "@/lib/music/sightread";
import { octaveGroupRoot } from "@/lib/music/theory";

type Phase = "idle" | "countin" | "playing" | "done";

interface SightReadPracticeProps {
  question: SightReadQuestion;
  countIn: boolean;
  metronomeVolume: number;
  labelFor?: (midi: number) => string;
  onFinish: (ok: boolean) => void;
  /** 把内部判键函数注册给外层，供物理键盘 / Web MIDI 复用 */
  registerPick?: (pick: ((midi: number) => void) | null) => void;
}

/**
 * 视奏：看谱 → 预备拍 → 跟着拍子把旋律弹出来。
 * 每个音有 ±半拍 的时间窗，逐音记录「音高 + 时值」是否命中。
 */
export function SightReadPractice({
  question, countIn, metronomeVolume, labelFor, onFinish, registerPick,
}: SightReadPracticeProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [hits, setHits] = useState<(boolean | null)[]>(() => question.notes.map(() => null));
  const [results, setResults] = useState<boolean[] | null>(null);

  const timelineRef = useRef(0);
  const hitsRef = useRef<(boolean | null)[]>(question.notes.map(() => null));
  const phaseRef = useRef<Phase>("idle");
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;
  const timersRef = useRef<number[]>([]);
  const tickerRef = useRef<number | null>(null);

  const spb = 60 / question.bpm;
  const beats = Number(question.meter.split("/")[0]) || 4;
  const leadBeats = countIn ? beats : 0;
  const windowSec = hitWindowSec(question.bpm);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    if (tickerRef.current !== null) {
      window.clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearTimers();
      stopAllNotes();
    };
  }, [clearTimers, question]);

  const finalize = useCallback(() => {
    if (phaseRef.current === "done") return;
    phaseRef.current = "done";
    clearTimers();
    stopAllNotes();
    const finalHits = hitsRef.current.map((hit) => hit === true);
    hitsRef.current = finalHits;
    setHits(finalHits);
    setResults(finalHits);
    setActiveIndex(null);
    setPhase("done");
    const hitCount = finalHits.filter(Boolean).length;
    // 允许一个小失误，避免整段练习因一个音全盘否定
    finishRef.current(hitCount >= Math.ceil(finalHits.length * 0.8));
  }, [clearTimers]);

  const playDemo = useCallback(() => {
    stopAllNotes();
    const ctx = getAudioContext();
    const base = ctx ? ctx.currentTime + 0.06 : 0;
    question.notes.forEach((item) => {
      playMidi(item.midi, Math.min(item.durationSec * 0.9, 1.2), 0.2, ctx ? base + item.onsetSec : undefined);
    });
  }, [question]);

  const start = useCallback(() => {
    stopAllNotes();
    clearTimers();
    hitsRef.current = question.notes.map(() => null);
    setHits(hitsRef.current);
    setResults(null);
    setActiveIndex(null);
    phaseRef.current = leadBeats > 0 ? "countin" : "playing";
    setPhase(phaseRef.current);

    const ctx = getAudioContext();
    const base = ctx ? ctx.currentTime + 0.1 : 0;
    const volume = metronomeVolume / 100;
    for (let index = 0; index < leadBeats; index++) {
      scheduleClick(base + index * spb, index === 0, volume, true);
    }
    const melodyAt = base + leadBeats * spb;
    // 旋律期间每拍一个轻点击，作为节拍参照
    const totalBeats = question.totalSec / spb;
    for (let beat = 0; beat < Math.ceil(totalBeats); beat++) {
      scheduleClick(melodyAt + beat * spb, beat % beats === 0, volume * 0.55, true);
    }

    // 音频统一从 ctx.currentTime + 0.1 起排程，判定时间轴同步偏移 100ms
    const leadMs = leadBeats * spb * 1000;
    timelineRef.current = performance.now() + 100 + leadMs;
    if (leadBeats > 0) {
      timersRef.current.push(
        window.setTimeout(() => {
          phaseRef.current = "playing";
          setPhase("playing");
        }, 100 + leadMs),
      );
    }

    tickerRef.current = window.setInterval(() => {
      if (phaseRef.current !== "playing") return;
      const elapsed = (performance.now() - timelineRef.current) / 1000;
      const index = question.notes.findIndex(
        (item) => elapsed >= item.onsetSec - windowSec && elapsed <= item.onsetSec + windowSec,
      );
      setActiveIndex(index >= 0 ? index : null);
      if (elapsed > question.totalSec + windowSec + 0.15) finalize();
    }, 40);
  }, [beats, clearTimers, finalize, leadBeats, metronomeVolume, question, spb, windowSec]);

  const handlePick = useCallback(
    (midi: number) => {
      playKey(midi);
      if (phaseRef.current !== "playing") return;
      const elapsed = (performance.now() - timelineRef.current) / 1000;
      let target = -1;
      let best = Infinity;
      question.notes.forEach((item, index) => {
        if (hitsRef.current[index] !== null) return;
        const distance = Math.abs(elapsed - item.onsetSec);
        // 十六分音符等短音收窄窗口，避免相邻音互相吞掉
        const tolerance = Math.min(windowSec, item.durationSec * 0.6);
        if (distance <= tolerance && distance < best) {
          best = distance;
          target = index;
        }
      });
      if (target < 0) return;
      const next = [...hitsRef.current];
      next[target] = midi === question.notes[target].midi;
      hitsRef.current = next;
      setHits(next);
    },
    [question, windowSec],
  );

  useEffect(() => {
    if (!registerPick) return;
    registerPick(handlePick);
    return () => registerPick(null);
  }, [handlePick, registerPick]);

  const midis = question.notes.map((item) => item.midi);
  const lo = octaveGroupRoot(Math.min(...midis));
  const hi = octaveGroupRoot(Math.max(...midis)) + 11;
  const hitCount = hits.filter((hit) => hit === true).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="text-sm">
            {phase === "idle" && <span className="text-muted-foreground">看谱后点「开始」，跟着预备拍把这一小节弹出来</span>}
            {phase === "countin" && <span className="font-medium">预备拍… 准备开始</span>}
            {phase === "playing" && <span className="font-medium text-emerald-700">演奏中 · 命中 {hitCount}/{question.notes.length}</span>}
            {phase === "done" && (
              <span className={hitCount === question.notes.length ? "font-medium text-emerald-700" : "font-medium text-amber-700"}>
                完成 · 命中 {hitCount}/{question.notes.length} 个音
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={playDemo} aria-label="听示范">
              <Volume2 className="mr-1 size-3.5" />
              听示范
            </Button>
            <Button size="sm" onClick={start}>
              {phase === "idle" ? <Play className="mr-1 size-3.5" /> : <RotateCcw className="mr-1 size-3.5" />}
              {phase === "idle" ? "开始" : "再来一次"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <PhraseSheet
        phrase={question.phrase}
        activeIndex={phase === "playing" ? activeIndex : null}
        results={results}
      />

      <Card>
        <CardContent className="pt-5">
          <PianoKeyboard
            targets={phase === "done" ? midis : []}
            pressed={[]}
            span={[lo, hi]}
            revealed={phase === "done"}
            labelFor={labelFor}
            onPick={handlePick}
          />
        </CardContent>
      </Card>

      {phase === "done" && (
        <Card>
          <CardContent className="py-4">
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">逐音判定</h3>
            <div className="flex flex-wrap gap-2">
              {hits.map((hit, index) => (
                <span
                  key={index}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                    hit
                      ? "border-emerald-500/50 bg-emerald-50 text-emerald-700"
                      : "border-red-500/50 bg-red-50 text-red-700"
                  }`}
                >
                  {hit ? <Check className="size-3" /> : <X className="size-3" />}
                  {index + 1} · {labelFor ? labelFor(question.notes[index].midi) : question.notes[index].midi}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
