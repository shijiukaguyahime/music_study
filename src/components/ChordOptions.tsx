import { cn } from "cn";
import { Check } from "lucide-react";
import { qualityOf, type ChordQualityId } from "@/lib/music/chord";

interface ChordOptionsProps {
  /** 性质选项（按钮显示短名） */
  qualityOptions: ChordQualityId[];
  /** 级数选项（调内题才有） */
  degreeOptions: string[];
  correctQuality: ChordQualityId;
  correctDegree: string | null;
  pickedQuality: ChordQualityId | null;
  pickedDegree: string | null;
  /** 是否需要选级数（调内题） */
  showDegree: boolean;
  revealed: boolean;
  onPickQuality: (id: ChordQualityId) => void;
  onPickDegree: (label: string) => void;
}

export function ChordOptions({
  qualityOptions,
  degreeOptions,
  correctQuality,
  correctDegree,
  pickedQuality,
  pickedDegree,
  showDegree,
  revealed,
  onPickQuality,
  onPickDegree,
}: ChordOptionsProps) {
  const qualityState = (id: ChordQualityId): "idle" | "correct" | "wrong" => {
    if (!revealed) return "idle";
    if (id === correctQuality) return "correct";
    if (id === pickedQuality) return "wrong";
    return "idle";
  };
  const degreeState = (label: string): "idle" | "correct" | "wrong" => {
    if (!revealed) return "idle";
    if (label === correctDegree) return "correct";
    if (label === pickedDegree) return "wrong";
    return "idle";
  };
  const degreeActive = showDegree && !!pickedQuality && !revealed;

  const cellClass = (state: "idle" | "correct" | "wrong") =>
    cn(
      "flex h-14 items-center justify-center gap-2 rounded-lg border border-input bg-background",
      "text-base font-medium transition-colors duration-150",
      "hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
      state === "correct" && "border-emerald-600 bg-emerald-500 text-white hover:bg-emerald-500",
      state === "wrong" && "border-red-600 bg-red-500 text-white hover:bg-red-500",
    );

  return (
    <div className="w-full space-y-4">
      <div>
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>① 和弦性质</span>
          {revealed && (
            <span className="font-medium text-foreground">{qualityOf(correctQuality).zh}</span>
          )}
        </div>
        <div
          className={cn(
            "grid gap-2",
            qualityOptions.length >= 6 ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-4",
          )}
          role="group"
          aria-label="和弦性质选项"
        >
          {qualityOptions.map((id, index) => {
            const state = qualityState(id);
            const quality = qualityOf(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => onPickQuality(id)}
                className={cellClass(state)}
                aria-label={quality.zh}
              >
                <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[11px] tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                {state === "correct" && <Check className="size-4" />}
                <span>{quality.short}</span>
              </button>
            );
          })}
        </div>
      </div>

      {showDegree && (
        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>② 调内级数</span>
            {revealed && correctDegree && (
              <span className="font-medium text-foreground">{correctDegree}</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="调内级数选项">
            {degreeOptions.map((label) => {
              const state = degreeState(label);
              return (
                <button
                  key={label}
                  type="button"
                  disabled={!degreeActive}
                  onClick={() => onPickDegree(label)}
                  className={cn(
                    cellClass(state),
                    !degreeActive && !revealed && "cursor-not-allowed opacity-40 hover:bg-background",
                  )}
                  aria-label={`级数 ${label}`}
                >
                  {state === "correct" && <Check className="size-4" />}
                  <span className="tabular-nums">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {showDegree
            ? "先选性质再选级数 · 快捷键 1 2 3 4"
            : "点击选项作答 · 快捷键 1 2 3 4"}
        </span>
        {revealed && !showDegree && (
          <span className="font-medium text-foreground">正确答案：{qualityOf(correctQuality).zh}</span>
        )}
      </div>
    </div>
  );
}
