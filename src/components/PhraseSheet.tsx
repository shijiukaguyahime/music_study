import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Accidental,
  BarlineType,
  Beam,
  Dot,
  Formatter,
  Fraction,
  Renderer,
  Stave,
  StaveNote,
  Voice,
} from "vexflow";
import { Card, CardContent } from "@/components/ui/card";
import { STAFF_TOP, diatonicExtent, vexKey } from "@/lib/music/theory";
import { barBeats, meterId, type Phrase, type TimedEvent } from "@/lib/music/rhythm";

const fontsReady = (async () => {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await Promise.race([
      Promise.all([document.fonts.load("40px Bravura"), document.fonts.load("40px Academico")]),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);
    await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 2000))]);
  } catch {
    /* 字体加载失败时仍尝试渲染 */
  }
})();

const MARGIN = 26;
const STAFF_HEIGHT = 40;
const STEP = 5;
const HEADROOM = 40;
const INK = 14;
/** 首小节为谱号+拍号额外让出的宽度 */
const FIRST_EXTRA = 58;

interface PhraseSheetProps {
  phrase: Phrase;
  /** 当前高亮的事件下标（按时间顺序展平后的索引），null=不高亮 */
  activeIndex: number | null;
}

function phraseNoteMidis(phrase: Phrase): number[] {
  const midis: number[] = [];
  phrase.bars.forEach((bar) => {
    bar.forEach((event) => {
      if (event.note) midis.push(event.note.midi);
    });
  });
  return midis;
}

function restDuration(event: TimedEvent): string {
  return event.dur.endsWith(".") ? `${event.dur.slice(0, -1)}dr` : `${event.dur}r`;
}

function noteDuration(dur: TimedEvent["dur"]): string {
  return dur.endsWith(".") ? `${dur.slice(0, -1)}d` : dur;
}

export function PhraseSheet({ phrase, activeIndex }: PhraseSheetProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(680);
  const [drawVersion, setDrawVersion] = useState(0);
  const elementsRef = useRef<(SVGElement | null)[]>([]);

  const midis = useMemo(() => phraseNoteMidis(phrase), [phrase]);
  const lo = midis.length > 0 ? Math.min(...midis) : 60;
  const hi = midis.length > 0 ? Math.max(...midis) : 72;

  const height = useMemo(() => {
    const extent = diatonicExtent(Math.min(lo, 60), Math.max(hi, 72));
    const spaceAbove = Math.max(0, (extent.max - STAFF_TOP.treble) * STEP);
    const spaceBelow = Math.max(0, (STAFF_TOP.treble - extent.min) * STEP);
    const topLine = Math.max(HEADROOM, MARGIN + INK + spaceAbove);
    return Math.max(180, topLine + Math.max(spaceBelow, STAFF_HEIGHT) + INK + MARGIN);
  }, [lo, hi]);

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(320, Math.round(el.clientWidth)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    fontsReady.then(() => {
      if (alive) draw();
    });
    return () => {
      alive = false;
    };
  }, [phrase, width, height]);

  function draw() {
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = "";
    elementsRef.current = [];

    const renderer = new Renderer(host, Renderer.Backends.SVG);
    renderer.resize(width, height);
    const ctx = renderer.getContext();

    const staveWidth = Math.min(width - 24, 760);
    const staveX = Math.max(12, Math.round((width - staveWidth) / 2));
    const staveY = Math.max(12, height - MARGIN - STAFF_HEIGHT - HEADROOM);

    const totalBeats = phrase.bars.reduce((sum, bar) => sum + barBeats(bar), 0);
    const flex = staveWidth - FIRST_EXTRA;

    let x = staveX;
    const allItems: StaveNote[] = [];

    try {
      phrase.bars.forEach((bar, barIndex) => {
        const beats = barBeats(bar);
        const measureWidth = Math.round((flex * beats) / totalBeats) + (barIndex === 0 ? FIRST_EXTRA : 0);

        const stave = new Stave(x, staveY, measureWidth);
        if (barIndex === 0) {
          stave.addClef("treble");
          stave.addTimeSignature(meterId(phrase.meter));
        } else {
          stave.setBegBarType(BarlineType.NONE);
        }
        stave.setEndBarType(barIndex === phrase.bars.length - 1 ? BarlineType.END : BarlineType.SINGLE);
        stave.setContext(ctx);
        stave.draw();

        const items = bar.map((event) => {
          if (!event.note) {
            const rest = new StaveNote({
              keys: ["b/4"],
              duration: restDuration(event),
              clef: "treble",
            });
            if (event.dur.endsWith(".")) Dot.buildAndAttach([rest], { index: 0 });
            return rest;
          }
          const item = new StaveNote({
            keys: [vexKey(event.note)],
            duration: noteDuration(event.dur),
            clef: "treble",
            autoStem: true,
          });
          if (event.dur.endsWith(".")) Dot.buildAndAttach([item], { index: 0 });
          if (event.note.acc) item.addModifier(new Accidental(event.note.acc), 0);
          return item;
        });
        allItems.push(...items);

        const voice = new Voice({ numBeats: beats, beatValue: 4 })
          .setMode(Voice.Mode.SOFT)
          .addTickables(items);
        voice.setContext(ctx).setStave(stave);
        new Formatter().joinVoices([voice]).formatToStave([voice], stave);
        const beams = Beam.generateBeams(items, { groups: [new Fraction(2, 8)], beamRests: false });
        voice.draw();
        beams.forEach((beam) => {
          beam.setContext(ctx).draw();
        });

        x += measureWidth;
      });

      // draw 完成后按创建顺序取每个事件的 SVG 根元素（高亮只切 class）
      allItems.forEach((item, index) => {
        elementsRef.current[index] = item.getSVGElement() ?? null;
      });
    } catch (error) {
      console.error("[phrase-sheet] render fallback", error);
    }

    setDrawVersion((value) => value + 1);
  }

  // 高亮：只切 class，不重绘谱面
  useEffect(() => {
    elementsRef.current.forEach((el, index) => {
      if (!el) return;
      if (index === activeIndex) el.classList.add("phrase-active");
      else el.classList.remove("phrase-active");
    });
  }, [activeIndex, drawVersion]);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div
          ref={hostRef}
          className="w-full"
          style={{ height }}
          aria-label="乐句谱面"
          data-active-index={activeIndex ?? ""}
        />
      </CardContent>
    </Card>
  );
}
