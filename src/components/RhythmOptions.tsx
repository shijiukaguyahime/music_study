import { cn } from "cn";
import { Check } from "lucide-react";
import {
  DURATION_SYMBOLS,
  patternWidths,
  type RhythmPattern,
} from "@/lib/music/rhythmQuiz";

interface RhythmOptionsProps {
  options: RhythmPattern[];
  correctId: string;
  pickedId: string | null;
  revealed: boolean;
  onPick: (id: string) => void;
}

/** 节奏题：四个时值条选项，段宽按实际时值占比绘制 */
export function RhythmOptions({ options, correctId, pickedId, revealed, onPick }: RhythmOptionsProps) {
  const stateOf = (id: string): "idle" | "correct" | "wrong" => {
    if (!revealed) return "idle";
    if (id === correctId) return "correct";
    if (id === pickedId) return "wrong";
    return "idle";
  };

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="group" aria-label="节奏型选项">
        {options.map((pattern, index) => {
          const state = stateOf(pattern.id);
          const widths = patternWidths(pattern);
          return (
            <button
              key={pattern.id}
              type="button"
              onClick={() => onPick(pattern.id)}
              className={cn(
                "flex items-center gap-3 rounded-lg border border-input bg-background px-3 py-3 text-left",
                "transition-colors duration-150 hover:bg-accent",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                state === "correct" && "border-emerald-600 bg-emerald-500 text-white hover:bg-emerald-500",
                state === "wrong" && "border-red-600 bg-red-500 text-white hover:bg-red-500",
              )}
              aria-label={pattern.description}
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] tabular-nums text-muted-foreground",
                  state !== "idle" && "bg-white/25 text-white",
                )}
              >
                {state === "correct" ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex h-8 w-full overflow-hidden rounded border border-black/15">
                  {pattern.durs.map((dur, slot) => (
                    <span
                      key={`${dur}-${slot}`}
                      className={cn(
                        "flex items-center justify-center border-r border-black/15 text-[10px] tabular-nums last:border-r-0",
                        slot % 2 === 1 && "bg-black/5",
                      )}
                      style={{ width: `${widths[slot]}%` }}
                    >
                      {DURATION_SYMBOLS[dur]}
                    </span>
                  ))}
                </span>
                <span className="mt-1 block truncate text-[11px] opacity-70">{pattern.description}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>点击时值条作答 · 快捷键 1 2 3 4</span>
        {revealed && (
          <span className="font-medium text-foreground">
            正确答案：{options.find((item) => item.id === correctId)?.description}
          </span>
        )}
      </div>
    </div>
  );
}
