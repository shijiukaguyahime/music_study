import { useEffect, useRef, useState } from "react";
import { Minus, Play, Plus, Square, Timer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getAudioContext, scheduleClick } from "@/lib/audio";

const MIN_BPM = 20;
const MAX_BPM = 300;
const DEFAULT_BPM = 60;
/** 调度器提前量与轮询间隔（毫秒） */
const LOOKAHEAD_MS = 120;
const TICK_MS = 40;
/** 每几拍一个强拍（暂时按 4/4 固定，拍号/强弱拍后续再做） */
const BEATS_PER_ACCENT = 4;

function clampBpm(value: number): number {
  return Math.min(MAX_BPM, Math.max(MIN_BPM, value));
}

interface MetronomeProps {
  /** 是否展示右下角弹框；收起时节拍器自动停止（速度保留） */
  open: boolean;
  onClose: () => void;
}

export function Metronome({ open, onClose }: MetronomeProps) {
  const [bpm, setBpm] = useState(DEFAULT_BPM);
  const [bpmText, setBpmText] = useState(String(DEFAULT_BPM));
  const [running, setRunning] = useState(false);
  const [beat, setBeat] = useState(0);
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;

  // 收起弹框 = 停止
  useEffect(() => {
    if (!open) setRunning(false);
  }, [open]);

  // 看拍调度：用 AudioContext 的时钟排未来 100ms 内的点击，避免 setInterval 漂移
  useEffect(() => {
    if (!open || !running) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    let current = 0;
    let nextTime = ctx.currentTime + 0.1;
    const timeouts = new Set<number>();

    const schedule = () => {
      while (nextTime < ctx.currentTime + LOOKAHEAD_MS / 1000) {
        scheduleClick(nextTime, current % BEATS_PER_ACCENT === 0);
        const delay = Math.max(0, (nextTime - ctx.currentTime) * 1000);
        const id = window.setTimeout(() => {
          timeouts.delete(id);
          setBeat(current);
        }, delay);
        timeouts.add(id);
        current += 1;
        nextTime += 60 / bpmRef.current;
      }
    };

    schedule();
    const timerId = window.setInterval(schedule, TICK_MS);
    return () => {
      window.clearInterval(timerId);
      timeouts.forEach((id) => window.clearTimeout(id));
    };
  }, [open, running]);

  const stepBpm = (delta: number) => {
    const next = clampBpm(bpm + delta);
    setBpm(next);
    setBpmText(String(next));
  };

  const commitBpm = () => {
    const parsed = Number.parseInt(bpmText, 10);
    const next = Number.isFinite(parsed) ? clampBpm(parsed) : bpm;
    setBpm(next);
    setBpmText(String(next));
  };

  if (!open) return null;

  return (
    <Card className="fixed right-4 bottom-4 z-50 w-64 shadow-lg">
      <CardContent className="space-y-3 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Timer className="size-4" />
            节拍器
          </div>
          <Button size="icon" variant="ghost" className="size-6" aria-label="关闭节拍器" onClick={onClose}>
            <X className="size-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            className="size-8"
            aria-label="降低速度"
            onClick={() => stepBpm(-1)}
          >
            <Minus className="size-3.5" />
          </Button>
          <Input
            type="number"
            inputMode="numeric"
            min={MIN_BPM}
            max={MAX_BPM}
            value={bpmText}
            aria-label="速度"
            className="h-8 w-16 px-1 text-center font-semibold tabular-nums"
            onChange={(event) => {
              setBpmText(event.target.value);
              const parsed = Number.parseInt(event.target.value, 10);
              if (Number.isFinite(parsed) && parsed >= MIN_BPM && parsed <= MAX_BPM) setBpm(parsed);
            }}
            onBlur={commitBpm}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
          <span className="text-xs text-muted-foreground">BPM</span>
          <Button
            size="icon"
            variant="outline"
            className="size-8"
            aria-label="提高速度"
            onClick={() => stepBpm(1)}
          >
            <Plus className="size-3.5" />
          </Button>
          <span className="relative ml-auto mr-1 flex size-3" aria-hidden>
            {running && (
              <span
                key={beat}
                data-beat={beat}
                className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"
              />
            )}
            <span className="relative inline-flex size-3 rounded-full bg-primary/30" />
          </span>
        </div>

        <Button
          className="w-full"
          size="sm"
          aria-label={running ? "停止节拍器" : "开始节拍器"}
          onClick={() => setRunning((value) => !value)}
        >
          {running ? (
            <>
              <Square className="mr-1.5 size-3.5" />
              停止
            </>
          ) : (
            <>
              <Play className="mr-1.5 size-3.5" />
              开始
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
