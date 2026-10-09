import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Accidental,
  Formatter,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  Voice,
} from "vexflow";
import { Card, CardContent } from "@/components/ui/card";
import {
  GRAND_STAFF_GAP,
  STAFF_TOP,
  diatonicExtent,
  staffOfMidi,
  staffWindow,
  vexKey,
  type Clef,
  type Note,
  type Range,
  type Staff,
} from "@/lib/music/theory";

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
const HEADROOM = 40; // Stave 的 spaceAboveStaffLn：谱表 y 到顶线之间固定 4 行
const INK = 12; // 音符（含变音记号）外侧留白

type Geometry =
  | { kind: "single"; height: number; y: number }
  | { kind: "grand"; height: number; trebleY: number; bassY: number };

/** 根据音域算出稳定的谱表位置与画布高度（只在设置变化时变，答题时不抖动） */
function computeGeometry(clef: Clef, range: Range): Geometry {
  if (clef !== "grand") {
    const extent = diatonicExtent(range.lo, range.hi);
    const spaceAbove = Math.max(0, (extent.max - STAFF_TOP[clef]) * STEP);
    const spaceBelow = Math.max(0, (STAFF_TOP[clef] - extent.min) * STEP);
    const topLine = Math.max(HEADROOM, MARGIN + INK + spaceAbove);
    const height = Math.max(180, topLine + Math.max(spaceBelow, STAFF_HEIGHT) + INK + MARGIN);
    return { kind: "single", height, y: topLine - HEADROOM };
  }

  const trebleWindow = staffWindow(range, "treble", clef);
  const bassWindow = staffWindow(range, "bass", clef);
  const trebleExtent = diatonicExtent(trebleWindow.lo, trebleWindow.hi);
  const bassExtent = diatonicExtent(bassWindow.lo, bassWindow.hi);
  const spaceAbove = Math.max(0, (trebleExtent.max - STAFF_TOP.treble) * STEP);
  const trebleBelow = Math.max(0, (STAFF_TOP.treble - trebleExtent.min) * STEP);
  const bassBelow = Math.max(0, (STAFF_TOP.bass - bassExtent.min) * STEP);
  const topLine = Math.max(HEADROOM, MARGIN + INK + spaceAbove);
  const bottomNeed = Math.max(
    Math.max(trebleBelow, STAFF_HEIGHT),
    GRAND_STAFF_GAP + Math.max(bassBelow, STAFF_HEIGHT),
  );
  const height = Math.max(220, topLine + bottomNeed + INK + MARGIN);
  const trebleY = topLine - HEADROOM;
  return { kind: "grand", height, trebleY, bassY: trebleY + GRAND_STAFF_GAP };
}

interface StaffSheetProps {
  clef: Clef;
  range: Range;
  staff: Staff;
  notes: Note[];
  /** chord=叠成一个和弦（并行）；sequence=按顺序散开（依次） */
  layout: "chord" | "sequence";
  /** true=只画谱表、不画音符（瞬时记忆训练） */
  hidden?: boolean;
}

export function StaffSheet({ clef, range, staff, notes, layout, hidden }: StaffSheetProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const geometry = useMemo(() => computeGeometry(clef, range), [clef, range]);

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
  }, [clef, range, staff, notes, layout, hidden, width, geometry]);

  function draw() {
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = "";

    const renderer = new Renderer(host, Renderer.Backends.SVG);
    renderer.resize(width, geometry.height);
    const ctx = renderer.getContext();

    const staveWidth = Math.min(width - 24, 680);
    const staveX = Math.max(12, Math.round((width - staveWidth) / 2));

    const createStave = (y: number, clefName: string) => {
      const stave = new Stave(staveX, y, staveWidth);
      stave.addClef(clefName);
      stave.setContext(ctx);
      return stave;
    };

    const staves = {} as Record<Staff, Stave>;

    if (geometry.kind === "grand") {
      const treble = createStave(geometry.trebleY, "treble");
      const bass = createStave(geometry.bassY, "bass");
      treble.draw();
      bass.draw();
      new StaveConnector(treble, bass).setType(StaveConnector.type.BRACE).setContext(ctx).draw();
      new StaveConnector(treble, bass).setType(StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
      staves.treble = treble;
      staves.bass = bass;
    } else {
      const single = createStave(geometry.y, clef);
      single.draw();
      staves[staff] = single;
    }

    if (hidden) return;

    /** 该音记在哪条谱表上：大谱表按音高在中央C处分谱，其余整题固定一条谱表 */
    const staffOf = (note: Note): Staff => (clef === "grand" ? staffOfMidi(note.midi) : staff);
    const clefOf = (key: Staff): string => (clef === "grand" ? key : clef);

    try {
      if (notes.length > 1 && layout === "sequence") {
        const items = notes.map((note) => {
          const key = staffOf(note);
          const item = new StaveNote({
            keys: [vexKey(note)],
            duration: "q",
            clef: clefOf(key),
            autoStem: true,
          });
          if (note.acc) item.addModifier(new Accidental(note.acc), 0);
          return { key, item };
        });

        // 每条谱表一条 voice（谱表内的顺序仍是音高从低到高）
        const byStaff = new Map<Staff, StaveNote[]>();
        items.forEach(({ key, item }) => {
          const list = byStaff.get(key);
          if (list) list.push(item);
          else byStaff.set(key, [item]);
        });
        const voices = new Map<Staff, Voice>();
        byStaff.forEach((list, key) => {
          voices.set(
            key,
            new Voice({ numBeats: list.length, beatValue: 4 }).setMode(Voice.Mode.SOFT).addTickables(list),
          );
        });

        // 预格式化只为拿到每个音（含变音记号、错开的符头）的实际宽度
        Formatter.SimpleFormat(
          items.map(({ item }) => item),
          0,
        );
        items.forEach(({ key, item }) => item.setStave(staves[key]));

        // 共享时间轴：音符等分铺开、整组居中；跨谱表时对齐到同一套格子
        const used = [...byStaff.keys()];
        const left = Math.min(...used.map((key) => staves[key].getNoteStartX()));
        const right = Math.max(...used.map((key) => staves[key].getNoteEndX()));
        const slot = (right - left) / items.length;
        items.forEach(({ item }, index) => {
          const metrics = item.getMetrics();
          const contentCenter =
            item.getAbsoluteX() +
            (metrics.notePx +
              metrics.rightDisplacedHeadPx +
              metrics.modRightPx -
              metrics.modLeftPx -
              metrics.leftDisplacedHeadPx) /
              2;
          const desired = left + (index + 0.5) * slot;
          const tickContext = item.getTickContext();
          tickContext.setX(tickContext.getX() + (desired - contentCenter));
        });

        voices.forEach((voice, key) => {
          voice.setContext(ctx).setStave(staves[key]).drawWithStyle();
        });
        return;
      }

      // 并行：同一谱表上的音叠成一个和弦（二度会由 vexflow 自动错开符头），整组水平居中
      const byStaff = new Map<Staff, Note[]>();
      notes.forEach((note) => {
        const key = staffOf(note);
        const list = byStaff.get(key);
        if (list) list.push(note);
        else byStaff.set(key, [note]);
      });

      byStaff.forEach((group, key) => {
        const stave = staves[key];
        const staveNote = new StaveNote({
          keys: group.map(vexKey),
          duration: "q",
          clef: clefOf(key),
          autoStem: true,
        });
        group.forEach((note, index) => {
          if (note.acc) staveNote.addModifier(new Accidental(note.acc), index);
        });

        staveNote.setStave(stave);
        const voice = new Voice({ numBeats: 1, beatValue: 4 })
          .setMode(Voice.Mode.SOFT)
          .addTickables([staveNote]);
        new Formatter().joinVoices([voice]).formatToStave([voice], stave);

        // 把音符（含变音记号）水平居中
        const metrics = staveNote.getMetrics();
        const contentCenter =
          staveNote.getAbsoluteX() +
          (metrics.notePx + metrics.rightDisplacedHeadPx + metrics.modRightPx - metrics.modLeftPx - metrics.leftDisplacedHeadPx) /
            2;
        const center = (stave.getNoteStartX() + stave.getNoteEndX()) / 2;
        const tickContext = staveNote.getTickContext();
        tickContext.setX(tickContext.getX() + (center - contentCenter));

        voice.setContext(ctx).setStave(stave).drawWithStyle();
      });
    } catch (error) {
      console.error("[staff] render fallback", error);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div
          ref={hostRef}
          className="w-full"
          style={{ height: geometry.height }}
          aria-label="五线谱"
        />
      </CardContent>
    </Card>
  );
}
