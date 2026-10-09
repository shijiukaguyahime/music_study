import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Circle, RotateCcw, XCircle } from "lucide-react";
import { PianoKeyboard } from "@/components/PianoKeyboard";
import { SettingsPanel } from "@/components/SettingsPanel";
import { StaffSheet } from "@/components/StaffSheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DEFAULT_RANGE,
  KEY_HINTS,
  RANGES,
  generateNote,
  noteName,
  solfege,
  type Clef,
  type Note,
} from "@/lib/music/theory";

interface Stats {
  total: number;
  correct: number;
  streak: number;
  best: number;
}

const EMPTY_STATS: Stats = { total: 0, correct: 0, streak: 0, best: 0 };

export default function App() {
  const [clef, setClef] = useState<Clef>("treble");
  const [rangeId, setRangeId] = useState(DEFAULT_RANGE.treble);
  const [allowAccidentals, setAllowAccidentals] = useState(false);
  const [note, setNote] = useState<Note>(() =>
    generateNote(RANGES.treble[0], false),
  );
  const [picked, setPicked] = useState<number | null>(null);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);

  const timerRef = useRef<number | null>(null);

  const range = useMemo(
    () => RANGES[clef].find((item) => item.id === rangeId) ?? RANGES[clef][0],
    [clef, rangeId],
  );

  const goNext = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPicked(null);
    setNote(generateNote(range, allowAccidentals));
  }, [range, allowAccidentals]);

  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setPicked(null);
    setNote(generateNote(range, allowAccidentals));
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [range, allowAccidentals]);

  const answer = useCallback(
    (pc: number) => {
      if (picked !== null) return;
      const ok = pc === note.pc;
      setPicked(pc);
      setStats((prev) => {
        const streak = ok ? prev.streak + 1 : 0;
        return {
          total: prev.total + 1,
          correct: prev.correct + (ok ? 1 : 0),
          streak,
          best: Math.max(prev.best, streak),
        };
      });
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setPicked(null);
        setNote(generateNote(range, allowAccidentals, note.midi));
      }, 1500);
    },
    [picked, note, range, allowAccidentals],
  );

  const handlerRef = useRef<(event: KeyboardEvent) => void>(() => {});
  handlerRef.current = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    const key = event.key.toLowerCase();
    if (key === " " || key === "enter") {
      if (picked !== null) {
        event.preventDefault();
        goNext();
      }
      return;
    }
    const pc = KEY_HINTS[key];
    if (pc !== undefined) {
      event.preventDefault();
      answer(pc);
    }
  };

  useEffect(() => {
    const listener = (event: KeyboardEvent) => handlerRef.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const revealed = picked !== null;
  const wasCorrect = revealed && picked === note.pc;
  const accuracy =
    stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-baseline gap-3">
            <h1 className="text-xl font-semibold tracking-tight">识谱训练</h1>
            <p className="text-sm text-muted-foreground">五线谱视奏练习</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="default">
              单音训练
            </Button>
            <Button size="sm" variant="ghost" disabled>
              乐句训练
              <Badge variant="secondary" className="ml-2">
                即将上线
              </Badge>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
        <Card>
          <CardContent className="py-5">
            <SettingsPanel
              clef={clef}
              rangeId={range.id}
              allowAccidentals={allowAccidentals}
              onClefChange={setClef}
              onRangeChange={setRangeId}
              onAccidentalsChange={setAllowAccidentals}
            />
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <div className="space-y-4">
            <StaffSheet clef={clef} note={note} />

            <Card
              className={
                !revealed
                  ? "border-dashed"
                  : wasCorrect
                    ? "border-emerald-500/60 bg-emerald-50"
                    : "border-red-500/60 bg-red-50"
              }
            >
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="flex items-center gap-2 text-sm">
                  {!revealed ? (
                    <>
                      <Circle className="size-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        看谱后在下方钢琴键盘上作答
                      </span>
                    </>
                  ) : wasCorrect ? (
                    <>
                      <CheckCircle2 className="size-4 text-emerald-600" />
                      <span className="font-medium text-emerald-700">
                        回答正确：{noteName(note)} · {solfege(note)}
                      </span>
                    </>
                  ) : (
                    <>
                      <XCircle className="size-4 text-red-600" />
                      <span className="font-medium text-red-700">
                        答错了，正确答案是 {noteName(note)} · {solfege(note)}
                      </span>
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
                <PianoKeyboard
                  correctPc={note.pc}
                  pickedPc={picked}
                  revealed={revealed}
                  onPick={answer}
                />
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
                    onClick={() => setStats(EMPTY_STATS)}
                    aria-label="重置成绩"
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="题数" value={String(stats.total)} />
                  <Stat label="正确率" value={`${accuracy}%`} />
                  <Stat label="连击" value={String(stats.streak)} />
                  <Stat label="最佳连击" value={String(stats.best)} />
                </div>
                <div className="rounded-md bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                  快捷键：白键 A S D F G H J，黑键 W E T Y U，空格跳到下一题。
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
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
