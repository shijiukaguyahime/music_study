import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, EyeOff } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { playMidi } from "@/lib/audio";
import { WHITE_PCS, midiLabel, pcOf } from "@/lib/music/theory";

/** 显示区恒为两个八度；最低窗口从 C1 起，最高窗口顶端到 B7（均在采样覆盖范围内） */
const MIN_BASE = 24;
const MAX_BASE = 72;
/** 窗口最高音相对最低音的半音数（两个八度） */
const SPAN = 23;

/**
 * 物理键盘两排，避免和「选项 1–9」快捷键冲突：
 * 上排 Q–U = 窗口高八度，下排 Z–M = 窗口低八度，黑键用 Shift 升半音。
 */
const ROWS: { offset: number; codes: string[] }[] = [
  { offset: 12, codes: ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU"] },
  { offset: 0, codes: ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM"] },
];

/** 上方有黑键的白键音级：C D F G A；E/B 无黑键，Shift 不生效 */
const SHARPABLE_PCS = new Set([0, 2, 5, 7, 9]);

function codeLabel(code: string): string {
  return code.startsWith("Key") ? code.slice(3) : code;
}

interface ScratchKeyboardProps {
  /** 窗口锚点（通常取题目最低音所在八度组根音）；换题时窗口跟随移动 */
  anchor: number;
  /** 本题答案的完整音高：用于「答案键位」标记 */
  targets: number[];
  /** 已作答揭晓：此时自动标出答案键位 */
  revealed: boolean;
}

/**
 * 陪练键盘：只看谱/听音对照着随手弹，不判定、不计分，与选择题作答互不干扰。
 * 两个八度窗口，可用 ◀ ▶ 整体移八度；作答揭晓后（或手动开启「答案键位」）标出本题的琴键。
 */
export function ScratchKeyboard({ anchor, targets, revealed }: ScratchKeyboardProps) {
  /** 相对锚点的八度偏移 */
  const [shift, setShift] = useState(0);
  const [held, setHeld] = useState<number[]>([]);
  const [peek, setPeek] = useState(false);
  const codeMidiRef = useRef(new Map<string, number>());

  const base = useMemo(() => {
    const raw = anchor + shift * 12;
    return Math.min(Math.max(raw, MIN_BASE), MAX_BASE);
  }, [anchor, shift]);

  const canShiftDown = anchor + (shift - 1) * 12 >= MIN_BASE;
  const canShiftUp = anchor + (shift + 1) * 12 <= MAX_BASE;

  const press = useCallback((midi: number) => {
    playMidi(midi, 1.4, 0.22, undefined, false);
    setHeld((prev) => (prev.includes(midi) ? prev : [...prev, midi]));
  }, []);

  const release = useCallback((midi: number) => {
    setHeld((prev) => prev.filter((item) => item !== midi));
  }, []);

  const releaseAll = useCallback(() => {
    codeMidiRef.current.clear();
    setHeld([]);
  }, []);

  // 换八度/换题时清掉残留的按下状态
  useEffect(() => {
    codeMidiRef.current.clear();
    setHeld([]);
  }, [base]);

  useEffect(() => {
    const resolve = (code: string, isSharp: boolean): number | null => {
      for (const row of ROWS) {
        const index = row.codes.indexOf(code);
        if (index < 0) continue;
        const pc = WHITE_PCS[index];
        return base + row.offset + pc + (isSharp && SHARPABLE_PCS.has(pc) ? 1 : 0);
      }
      return null;
    };
    const onDown = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const el = event.target as HTMLElement | null;
      if (el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      const midi = resolve(event.code, event.shiftKey);
      if (midi === null) return;
      event.preventDefault();
      if (codeMidiRef.current.has(event.code)) return;
      codeMidiRef.current.set(event.code, midi);
      press(midi);
    };
    const onUp = (event: KeyboardEvent) => {
      const midi = codeMidiRef.current.get(event.code);
      if (midi === undefined) return;
      codeMidiRef.current.delete(event.code);
      release(midi);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", releaseAll);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", releaseAll);
    };
  }, [base, press, release, releaseAll]);

  const whites: number[] = [];
  const blacks: number[] = [];
  for (let midi = base; midi <= base + SPAN; midi += 1) {
    (WHITE_PCS.includes(pcOf(midi)) ? whites : blacks).push(midi);
  }

  /** 完整音高 → 快捷键标签（黑键为「⇧字母」） */
  const shortcutByMidi = useMemo(() => {
    const map = new Map<number, string>();
    for (const row of ROWS) {
      WHITE_PCS.forEach((pc, index) => {
        const label = codeLabel(row.codes[index]);
        map.set(base + row.offset + pc, label);
        if (SHARPABLE_PCS.has(pc)) map.set(base + row.offset + pc + 1, `⇧${label}`);
      });
    }
    return map;
  }, [base]);

  const showTargets = revealed || peek;

  const whiteClass = (midi: number) => {
    const isTarget = showTargets && targets.includes(midi);
    return cn(
      "relative flex-1 cursor-pointer rounded-b-[6px] border border-r-0 border-neutral-300 bg-white",
      "flex flex-col items-center justify-end gap-0.5 pb-2 transition-colors duration-150",
      "last:border-r hover:bg-neutral-100 active:bg-neutral-200",
      "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
      held.includes(midi) && "bg-neutral-200 hover:bg-neutral-200",
      isTarget && "border-emerald-600 bg-emerald-500 text-white hover:bg-emerald-500",
    );
  };

  const blackClass = (midi: number) => {
    const isTarget = showTargets && targets.includes(midi);
    return cn(
      "absolute top-0 z-10 h-[62%] cursor-pointer rounded-b-[5px] border border-black/40",
      "flex items-end justify-center pb-1.5 text-[10px] font-medium text-neutral-400",
      "bg-neutral-900 shadow-[0_3px_0_rgba(0,0,0,0.35)] transition-colors duration-150",
      "hover:bg-neutral-700 active:bg-neutral-600",
      "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
      held.includes(midi) && "bg-neutral-700 hover:bg-neutral-700",
      isTarget && "border-emerald-400 bg-emerald-600 text-white hover:bg-emerald-600",
    );
  };

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h2 className="text-sm font-medium">陪练键盘</h2>
          <span className="text-xs text-muted-foreground">随意试弹，不影响本题作答</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="icon-sm"
            variant="outline"
            disabled={!canShiftDown}
            onClick={() => setShift((value) => value - 1)}
            aria-label="低一个八度"
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-[86px] text-center text-xs tabular-nums text-muted-foreground">
            {midiLabel(base)} – {midiLabel(base + SPAN)}
          </span>
          <Button
            size="icon-sm"
            variant="outline"
            disabled={!canShiftUp}
            onClick={() => setShift((value) => value + 1)}
            aria-label="高一个八度"
          >
            <ChevronRight />
          </Button>
          <Button
            size="sm"
            variant={peek ? "default" : "outline"}
            onClick={() => setPeek((value) => !value)}
            aria-pressed={peek}
            title="在键盘上标出本题的音"
          >
            {peek ? <EyeOff /> : <Eye />}
            答案键位
          </Button>
        </div>
      </div>

      <div
        className="relative flex h-[clamp(120px,19vw,160px)] w-full touch-manipulation"
        style={
          {
            "--wk": `calc(100% / ${whites.length})`,
            "--bk": "calc(var(--wk) * 0.62)",
          } as React.CSSProperties
        }
        role="group"
        aria-label={`陪练键盘，${midiLabel(base)} 到 ${midiLabel(base + SPAN)}`}
      >
        {whites.map((midi) => (
          <button
            key={midi}
            type="button"
            className={whiteClass(midi)}
            aria-label={midiLabel(midi)}
            data-midi={midi}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              press(midi);
            }}
            onPointerUp={() => release(midi)}
            onPointerCancel={() => release(midi)}
          >
            <span className="text-[10px] tabular-nums text-neutral-400">
              {shortcutByMidi.get(midi)}
            </span>
            <span className="text-xs font-semibold tabular-nums sm:text-sm">{midiLabel(midi)}</span>
          </button>
        ))}

        {blacks.map((midi) => {
          // 黑键位于「左侧白键数」的边界上
          const left = whites.filter((white) => white < midi).length;
          return (
            <button
              key={midi}
              type="button"
              className={blackClass(midi)}
              style={{ left: `calc(var(--wk) * ${left} - var(--bk) / 2)`, width: "var(--bk)" }}
              aria-label={midiLabel(midi)}
              data-midi={midi}
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                press(midi);
              }}
              onPointerUp={() => release(midi)}
              onPointerCancel={() => release(midi)}
            >
              <span className="tabular-nums">{shortcutByMidi.get(midi)}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>点击琴键或用键盘试弹：下排 Z–M = 低八度，上排 Q–U = 高八度，Shift 升半音（E、B 除外）</span>
        {showTargets && (
          <span className="font-medium text-foreground">
            本题琴键：{targets.map(midiLabel).join(" · ")}
          </span>
        )}
      </div>
    </div>
  );
}
