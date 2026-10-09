import { cn } from "cn";
import { BLACK_PCS, KEY_HINTS, PC_NAMES, WHITE_PCS } from "@/lib/music/theory";

// 黑键位于第 n 个白键之后（0-based 白键序号）
const BLACK_AFTER_WHITE: Record<number, number> = { 1: 1, 3: 2, 6: 4, 8: 5, 10: 6 };

const SHORTCUT_BY_PC: Record<number, string> = Object.fromEntries(
  Object.entries(KEY_HINTS).map(([k, pc]) => [pc, k.toUpperCase()]),
);

interface PianoKeyboardProps {
  correctPc: number;
  pickedPc: number | null;
  revealed: boolean;
  onPick: (pc: number) => void;
}

type KeyState = "idle" | "correct" | "wrong";

export function PianoKeyboard({ correctPc, pickedPc, revealed, onPick }: PianoKeyboardProps) {
  const stateOf = (pc: number): KeyState => {
    if (!revealed) return "idle";
    if (pc === correctPc) return "correct";
    if (pc === pickedPc) return "wrong";
    return "idle";
  };

  const whiteClass = (state: KeyState) =>
    cn(
      "relative flex-1 cursor-pointer rounded-b-[6px] border border-r-0 border-neutral-300 bg-white",
      "flex flex-col items-center justify-end pb-3 transition-colors duration-150",
      "last:border-r focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
      "hover:bg-neutral-100 active:bg-neutral-200",
      state === "correct" && "border-emerald-600 bg-emerald-500 text-white hover:bg-emerald-500",
      state === "wrong" && "border-red-600 bg-red-500 text-white hover:bg-red-500",
    );

  const blackClass = (state: KeyState) =>
    cn(
      "absolute top-0 z-10 h-[62%] cursor-pointer rounded-b-[5px] border border-black/40",
      "flex items-end justify-center pb-2 text-[11px] font-medium text-neutral-400",
      "bg-neutral-900 shadow-[0_3px_0_rgba(0,0,0,0.35)] transition-colors duration-150",
      "hover:bg-neutral-700 active:bg-neutral-600",
      "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
      state === "correct" && "border-emerald-400 bg-emerald-600 text-white hover:bg-emerald-600",
      state === "wrong" && "border-red-400 bg-red-600 text-white hover:bg-red-600",
    );

  return (
    <div className="w-full">
      <div
        className="relative flex h-[clamp(150px,24vw,200px)] w-full touch-manipulation"
        style={
          {
            "--wk": "calc(100% / 7)",
            "--bk": "calc(var(--wk) * 0.62)",
          } as React.CSSProperties
        }
        role="group"
        aria-label="钢琴键盘，共 12 个音"
      >
        {WHITE_PCS.map((pc) => {
          const state = stateOf(pc);
          return (
            <button
              key={pc}
              type="button"
              onClick={() => onPick(pc)}
              className={whiteClass(state)}
              aria-label={PC_NAMES[pc]}
              data-pc={pc}
            >
              <span className="text-[10px] tabular-nums text-neutral-400">
                {SHORTCUT_BY_PC[pc]}
              </span>
              <span className="text-sm font-semibold tracking-wide">{PC_NAMES[pc]}</span>
            </button>
          );
        })}

        {BLACK_PCS.map((pc) => {
          const state = stateOf(pc);
          const left = BLACK_AFTER_WHITE[pc];
          return (
            <button
              key={pc}
              type="button"
              onClick={() => onPick(pc)}
              className={blackClass(state)}
              style={{ left: `calc(var(--wk) * ${left} - var(--bk) / 2)`, width: "var(--bk)" }}
              aria-label={PC_NAMES[pc]}
              data-pc={pc}
            >
              <span className="text-[9px] tabular-nums text-neutral-500">
                {SHORTCUT_BY_PC[pc]}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>点击琴键作答 · 一组 12 个音（白键 A S D F G H J，黑键 W E T Y U）</span>
        {revealed && <span className="font-medium text-foreground">正确琴键：{PC_NAMES[correctPc]}</span>}
      </div>
    </div>
  );
}
