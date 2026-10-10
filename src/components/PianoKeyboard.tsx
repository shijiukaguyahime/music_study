import { cn } from "cn";
import { KEY_HINTS, WHITE_PCS, midiLabel, pcOf } from "@/lib/music/theory";

const SHORTCUT_BY_PC: Record<number, string> = Object.fromEntries(
  Object.entries(KEY_HINTS).map(([k, pc]) => [pc, k.toUpperCase()]),
);

interface PianoKeyboardProps {
  /** 本题要依次按下的完整音高（正确答案，顺序即作答顺序） */
  targets: number[];
  /** 本轮已经按下的完整音高 */
  pressed: number[];
  /** 显示区 [lo, hi]，恒为完整八度组（单音一组，跨组两组并排） */
  span: [number, number];
  /** 作答已结束 */
  revealed: boolean;
  onPick: (midi: number) => void;
}

type KeyState = "idle" | "pressed" | "correct" | "wrong";

export function PianoKeyboard({ targets, pressed, span, revealed, onPick }: PianoKeyboardProps) {
  const [lo, hi] = span;
  const whites: number[] = [];
  const blacks: number[] = [];
  for (let midi = lo; midi <= hi; midi += 1) {
    (WHITE_PCS.includes(pcOf(midi)) ? whites : blacks).push(midi);
  }

  const stateOf = (midi: number): KeyState => {
    const wasPressed = pressed.includes(midi);
    if (wasPressed) return targets.includes(midi) ? "correct" : "wrong";
    if (revealed) return targets.includes(midi) ? "correct" : "idle";
    return "idle";
  };

  const whiteClass = (state: KeyState) =>
    cn(
      "relative flex-1 cursor-pointer rounded-b-[6px] border border-r-0 border-neutral-300 bg-white",
      "flex flex-col items-center justify-end pb-3 transition-colors duration-150",
      "last:border-r focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
      "hover:bg-neutral-100 active:bg-neutral-200",
      state === "pressed" && "bg-neutral-200 hover:bg-neutral-200",
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
      state === "pressed" && "bg-neutral-700 hover:bg-neutral-700",
      state === "correct" && "border-emerald-400 bg-emerald-600 text-white hover:bg-emerald-600",
      state === "wrong" && "border-red-400 bg-red-600 text-white hover:bg-red-600",
    );

  const answerText = targets.map(midiLabel).join(" → ");

  return (
    <div className="w-full">
      <div
        className="relative flex h-[clamp(150px,24vw,200px)] w-full touch-manipulation"
        style={
          {
            "--wk": `calc(100% / ${whites.length})`,
            "--bk": "calc(var(--wk) * 0.62)",
          } as React.CSSProperties
        }
        role="group"
        aria-label={`钢琴键盘，共 ${whites.length + blacks.length} 个音`}
      >
        {whites.map((midi) => {
          const state = stateOf(midi);
          return (
            <button
              key={midi}
              type="button"
              onClick={() => onPick(midi)}
              className={whiteClass(state)}
              aria-label={midiLabel(midi)}
              data-midi={midi}
              data-pc={pcOf(midi)}
            >
              <span className="text-[10px] tabular-nums text-neutral-400">
                {SHORTCUT_BY_PC[pcOf(midi)]}
              </span>
              <span className="text-sm font-semibold tracking-wide">{midiLabel(midi)}</span>
            </button>
          );
        })}

        {blacks.map((midi) => {
          const state = stateOf(midi);
          // 黑键位于「左侧白键数」的边界上
          const left = whites.filter((white) => white < midi).length;
          return (
            <button
              key={midi}
              type="button"
              onClick={() => onPick(midi)}
              className={blackClass(state)}
              style={{ left: `calc(var(--wk) * ${left} - var(--bk) / 2)`, width: "var(--bk)" }}
              aria-label={midiLabel(midi)}
              data-midi={midi}
              data-pc={pcOf(midi)}
            >
              <span className="text-[9px] tabular-nums text-neutral-500">
                {SHORTCUT_BY_PC[pcOf(midi)]}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>点击琴键作答 · 白键 A S D F G H J，黑键 W E T Y U</span>
        {revealed && <span className="font-medium text-foreground">正确琴键：{answerText}</span>}
      </div>
    </div>
  );
}
