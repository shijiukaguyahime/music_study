import { cn } from "cn";
import { Check } from "lucide-react";

interface IntervalOptionsProps {
  options: string[];
  correct: string;
  picked: string | null;
  revealed: boolean;
  onPick: (name: string) => void;
}

export function IntervalOptions({ options, correct, picked, revealed, onPick }: IntervalOptionsProps) {
  const stateOf = (name: string): "idle" | "correct" | "wrong" => {
    if (!revealed) return "idle";
    if (name === correct) return "correct";
    if (name === picked) return "wrong";
    return "idle";
  };

  return (
    <div className="w-full">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="group" aria-label="音程选项">
        {options.map((name, index) => {
          const state = stateOf(name);
          return (
            <button
              key={name}
              type="button"
              onClick={() => onPick(name)}
              className={cn(
                "flex h-16 items-center justify-center gap-2 rounded-lg border border-input bg-background",
                "text-lg font-medium transition-colors duration-150",
                "hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                state === "correct" &&
                  "border-emerald-600 bg-emerald-500 text-white hover:bg-emerald-500",
                state === "wrong" && "border-red-600 bg-red-500 text-white hover:bg-red-500",
              )}
              aria-label={name}
            >
              <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[11px] tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              {state === "correct" && <Check className="size-4" />}
              <span>{name}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>点击选项作答 · 快捷键 1 2 3 4</span>
        {revealed && <span className="font-medium text-foreground">正确答案：{correct}</span>}
      </div>
    </div>
  );
}
