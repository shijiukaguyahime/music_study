import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Accidental, Formatter, Renderer, Stave, StaveNote, Voice } from "vexflow";
import { Card, CardContent } from "@/components/ui/card";
import { vexKey, type Clef, type Note } from "@/lib/music/theory";

const fontsReady = (async () => {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load("40px Bravura"),
        document.fonts.load("40px Academico"),
      ]),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  } catch {
    /* 字体加载失败时仍尝试渲染 */
  }
})();

const STAFF_HEIGHT = 210;

interface StaffSheetProps {
  clef: Clef;
  note: Note;
}

export function StaffSheet({ clef, note }: StaffSheetProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(280, Math.round(el.clientWidth)));
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
  }, [clef, note, width]);

  function draw() {
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = "";

    const renderer = new Renderer(host, Renderer.Backends.SVG);
    renderer.resize(width, STAFF_HEIGHT);
    const ctx = renderer.getContext();

    const staveWidth = Math.min(width - 24, 620);
    const staveX = Math.max(12, Math.round((width - staveWidth) / 2));
    const stave = new Stave(staveX, 55, staveWidth);
    stave.addClef(clef);
    stave.setContext(ctx).draw();

    const staveNote = new StaveNote({
      keys: [vexKey(note)],
      duration: "q",
      clef,
    });
    if (note.acc) staveNote.addModifier(new Accidental(note.acc), 0);

    try {
      staveNote.setStave(stave);
      const voice = new Voice({ numBeats: 1, beatValue: 4 })
        .setMode(Voice.Mode.SOFT)
        .addTickables([staveNote]);
      new Formatter().joinVoices([voice]).formatToStave([voice], stave);

      const metrics = staveNote.getMetrics();
      const absX = staveNote.getAbsoluteX();
      const contentCenter =
        absX +
        (metrics.notePx +
          metrics.rightDisplacedHeadPx +
          metrics.modRightPx -
          metrics.modLeftPx -
          metrics.leftDisplacedHeadPx) /
          2;
      const center = (stave.getNoteStartX() + stave.getNoteEndX()) / 2;
      const shift = center - contentCenter;
      const tickContext = staveNote.getTickContext();
      tickContext.setX(tickContext.getX() + shift);

      voice.setContext(ctx).setStave(stave).drawWithStyle();
    } catch (error) {
      console.error("[staff] fallback", error);
      Formatter.FormatAndDraw(ctx, stave, [staveNote]);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div
          ref={hostRef}
          className="w-full"
          style={{ height: STAFF_HEIGHT }}
          aria-label="五线谱"
        />
      </CardContent>
    </Card>
  );
}
