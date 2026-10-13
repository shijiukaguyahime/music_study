import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, RefreshCw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getAudioContext, playMidi, stopAllNotes } from "@/lib/audio";
import { CHORD_MODE_LABELS, chordKeyLabel, type ChordKey, type ChordModeId } from "@/lib/music/chord";
import { noteName, solfege, tempoTermOf } from "@/lib/music/theory";
import {
  durationBeats,
  flattenEvents,
  generatePhrase,
  meterId,
  type Phrase,
} from "@/lib/music/rhythm";
import { PhraseSheet } from "@/components/PhraseSheet";

type PhraseModeId = Extract<ChordModeId, "major" | "naturalMinor">;

const PHRASE_MODE_LABELS: Record<PhraseModeId, string> = {
  major: "大调",
  naturalMinor: "自然小调",
};

const RANGE_LO = 60;
const RANGE_HI = 72;

const TEMPO_QUICK: { label: string; bpm: number }[] = [
  { label: "行板", bpm: 84 },
  { label: "中板", bpm: 108 },
  { label: "快板", bpm: 132 },
];

function buildPhrase(key: ChordKey, meter: [number, number], bars: number): Phrase {
  return generatePhrase({ key, meter, bars, lo: RANGE_LO, hi: RANGE_HI });
}

export function PhrasePractice() {
  const [keyMode, setKeyMode] = useState<PhraseModeId>("major");
  const [rootPc, setRootPc] = useState(0);
  const [meter, setMeter] = useState<"2/4" | "3/4" | "4/4">("4/4");
  const [bars, setBars] = useState(2);
  const [bpm, setBpm] = useState(84);
  const [phrase, setPhrase] = useState<Phrase>(() =>
    buildPhrase({ mode: "major", rootPc: 0 }, [4, 4], 2),
  );
  const [playing, setPlaying] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [played, setPlayed] = useState<number[]>([]);

  const rafRef = useRef<number | null>(null);
  const lastIdxRef = useRef(-1);
  const totalSecRef = useRef(0);
  const playingRef = useRef(false);

  const keyLabel = useMemo(() => {
    const key: ChordKey = { mode: keyMode, rootPc };
    return chordKeyLabel(key);
  }, [keyMode, rootPc]);

  const rootLabels = useMemo(() => {
    return Array.from({ length: 12 }, (_, pc) =>
      chordKeyLabel({ mode: keyMode, rootPc: pc }).replace(CHORD_MODE_LABELS[keyMode], ""),
    );
  }, [keyMode]);

  const term = tempoTermOf(bpm);
  const events = useMemo(() => flattenEvents(phrase), [phrase]);

  const cancelRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const stopPlayback = useCallback(() => {
    cancelRaf();
    playingRef.current = false;
    stopAllNotes();
    setPlaying(false);
    setActiveIndex(null);
    lastIdxRef.current = -1;
  }, [cancelRaf]);

  useEffect(() => () => stopPlayback(), [stopPlayback]);

  const regenerate = useCallback(
    (nextKey: ChordKey, nextMeter: [number, number], nextBars: number) => {
      stopPlayback();
      setPlayed([]);
      setPhrase(buildPhrase(nextKey, nextMeter, nextBars));
    },
    [stopPlayback],
  );

  const settingsKey = `${keyMode}|${rootPc}|${meter}|${bars}`;
  const prevSettingsRef = useRef(settingsKey);
  useEffect(() => {
    if (prevSettingsRef.current === settingsKey) return;
    prevSettingsRef.current = settingsKey;
    const parsed = meter.split("/").map(Number) as [number, number];
    regenerate({ mode: keyMode, rootPc }, parsed, bars);
  }, [settingsKey, keyMode, rootPc, meter, bars, regenerate]);

  const play = useCallback(() => {
    stopPlayback();
    const ctx = getAudioContext();
    if (!ctx) return;
    void ctx.resume();

    const flat = flattenEvents(phrase);
    const spb = 60 / Math.min(260, Math.max(30, bpm));
    const starts: number[] = [];
    let cursor = 0;
    flat.forEach((event) => {
      starts.push(cursor);
      const seconds = Math.max(0.12, durationBeats(event.dur) * spb * 0.92);
      if (event.note) playMidi(event.note.midi, seconds, 0.22, ctx.currentTime + 0.06 + cursor);
      cursor += durationBeats(event.dur) * spb;
    });
    totalSecRef.current = cursor;
    lastIdxRef.current = -1;
    playingRef.current = true;
    setPlaying(true);
    setPlayed([]);
    setActiveIndex(0);

    const t0 = ctx.currentTime + 0.06;
    const tick = () => {
      if (!playingRef.current) return;
      const now = getAudioContext();
      if (!now) return;
      const elapsed = now.currentTime - t0;
      if (elapsed >= totalSecRef.current + 0.2) {
        playingRef.current = false;
        setPlaying(false);
        setActiveIndex(null);
        setPlayed(flat.map((_, index) => index));
        lastIdxRef.current = -1;
        return;
      }
      let index = 0;
      for (let i = 0; i < starts.length; i++) {
        if (elapsed >= starts[i]) index = i;
      }
      if (index !== lastIdxRef.current) {
        lastIdxRef.current = index;
        setActiveIndex(index);
        setPlayed((prev) => (prev.includes(index) ? prev : [...prev, index]));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [bpm, phrase, stopPlayback]);

  const rootSelectValue = String(rootPc);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4 sm:gap-4 sm:py-5">
          <div className="space-y-2">
            <Label>拍号</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              value={meter}
              onValueChange={(value) => {
                if (value === "2/4" || value === "3/4" || value === "4/4") setMeter(value);
              }}
              className="justify-stretch"
              aria-label="拍号"
            >
              <ToggleGroupItem value="2/4">2/4</ToggleGroupItem>
              <ToggleGroupItem value="3/4">3/4</ToggleGroupItem>
              <ToggleGroupItem value="4/4">4/4</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="space-y-2">
            <Label>小节数</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              value={String(bars)}
              onValueChange={(value) => {
                if (value === "2" || value === "4") setBars(Number(value));
              }}
              className="justify-stretch"
              aria-label="小节数"
            >
              <ToggleGroupItem value="2">2 小节</ToggleGroupItem>
              <ToggleGroupItem value="4">4 小节</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phrase-mode">调式</Label>
            <Select value={keyMode} onValueChange={(value) => setKeyMode(value as PhraseModeId)}>
              <SelectTrigger id="phrase-mode" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["major", "naturalMinor"] as PhraseModeId[]).map((id) => (
                  <SelectItem key={id} value={id}>
                    {PHRASE_MODE_LABELS[id]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phrase-root">主音</Label>
            <Select value={rootSelectValue} onValueChange={(value) => setRootPc(Number(value))}>
              <SelectTrigger id="phrase-root" className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {rootLabels.map((label, pc) => (
                  <SelectItem key={pc} value={String(pc)}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phrase-bpm">速度</Label>
            <div className="flex items-center gap-2">
              <Input
                id="phrase-bpm"
                type="number"
                min={30}
                max={260}
                value={bpm}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isFinite(next)) setBpm(Math.min(260, Math.max(30, Math.round(next))));
                }}
                className="w-20"
                aria-label="速度 BPM"
              />
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {term ? `${term.it} ${term.zh}` : ""}
              </span>
            </div>
            <div className="flex gap-1">
              {TEMPO_QUICK.map((item) => (
                <Button
                  key={item.bpm}
                  size="sm"
                  variant={bpm === item.bpm ? "secondary" : "ghost"}
                  className="h-7 px-2 text-xs"
                  onClick={() => setBpm(item.bpm)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const parsed = meter.split("/").map(Number) as [number, number];
                regenerate({ mode: keyMode, rootPc }, parsed, bars);
              }}
              aria-label="换一句"
            >
              <RefreshCw className="mr-1 size-4" />
              换句
            </Button>
            <Button size="sm" onClick={playing ? stopPlayback : play} aria-label={playing ? "停止" : "播放"}>
              {playing ? <Square className="mr-1 size-4" /> : <Play className="mr-1 size-4" />}
              {playing ? "停止" : "播放"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <PhraseSheet phrase={phrase} activeIndex={activeIndex} />

      <Card>
        <CardContent className="py-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              已播放 {played.length} / {events.length}
            </h2>
            <span className="text-xs text-muted-foreground">
              {keyLabel} · {meterId(phrase.meter)} · {bpm} BPM
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5" data-testid="played-flow">
            {events.length === 0 ? (
              <span className="text-sm text-muted-foreground">—</span>
            ) : (
              events.map((event, index) => {
                const shown = played.includes(index);
                const current = index === activeIndex;
                const label = event.note
                  ? `${noteName(event.note)} · ${solfege(event.note)}`
                  : "休止";
                return (
                  <span
                    key={index}
                    className={[
                      "rounded-md border px-2 py-1 text-sm tabular-nums transition-colors",
                      !shown
                        ? "border-dashed border-muted-foreground/30 text-muted-foreground/40"
                        : event.note
                          ? current
                            ? "border-emerald-500 bg-emerald-50 font-medium text-emerald-800"
                            : "border-border bg-background"
                          : "border-border bg-muted text-muted-foreground",
                      current ? "ring-2 ring-emerald-500/40" : "",
                    ].join(" ")}
                  >
                    {shown ? label : "·"}
                  </span>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
