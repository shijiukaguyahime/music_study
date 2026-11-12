import { RotateCcw, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatMs } from "@/lib/music/labels";
import { describeQuestionKey } from "@/lib/progress";
import type { SessionState, SessionSummary } from "@/lib/session";
import type { SessionSize } from "@/lib/settings";

interface SessionPanelProps {
  session: SessionState;
  summary: SessionSummary;
  /** 当前训练模式名：一组练习按模式独立，标题上标清楚 */
  scopeLabel: string;
  onRestart: () => void;
  onReviewWrong: () => void;
  onSizeChange: (size: SessionSize) => void;
}

const SIZES: { value: SessionSize; label: string }[] = [
  { value: 0, label: "连续" },
  { value: 10, label: "10" },
  { value: 20, label: "20" },
  { value: 50, label: "50" },
];

export function SessionPanel({
  session, summary, scopeLabel, onRestart, onReviewWrong, onSizeChange,
}: SessionPanelProps) {
  const percent = session.size > 0 ? Math.min(100, Math.round((session.answered / session.size) * 100)) : 0;
  const wrongLabels = summary.wrongKeys.map(describeQuestionKey);

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <Target className="size-3.5" />
              一组练习 · {scopeLabel}
            </h2>
            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
              {session.size > 0
                ? `第 ${Math.min(session.answered, session.size)} / ${session.size} 题 · 对 ${session.correct}`
                : `连续练习 · 已答 ${session.answered} 题 · 对 ${session.correct}`}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">每个训练模式各自独立计数</p>
          </div>
          <Button size="icon" variant="ghost" className="size-7" onClick={onRestart} aria-label="重开一组" title="重开一组">
            <RotateCcw className="size-3.5" />
          </Button>
        </div>

        {session.size > 0 && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
          </div>
        )}

        <div className="flex flex-wrap gap-1">
          {SIZES.map((item) => (
            <Button
              key={item.value}
              size="sm"
              variant={session.size === item.value ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => onSizeChange(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </div>

        {session.finished && (
          <div className="space-y-2 rounded-md border bg-muted/50 p-3">
            <h3 className="text-xs font-semibold">本组小结</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <span className="text-muted-foreground">正确率</span>
              <span className="text-right font-medium tabular-nums">{summary.accuracy}%（{summary.correct}/{summary.total}）</span>
              <span className="text-muted-foreground">平均反应</span>
              <span className="text-right font-medium tabular-nums">{formatMs(summary.avgMs)}</span>
              <span className="text-muted-foreground">反应中位数</span>
              <span className="text-right font-medium tabular-nums">{formatMs(summary.medianMs)}</span>
              <span className="text-muted-foreground">用时</span>
              <span className="text-right font-medium tabular-nums">{formatMs(summary.durationMs)}</span>
            </div>

            {summary.slowest.length > 0 && (
              <div className="text-xs">
                <span className="text-muted-foreground">最慢的音：</span>
                {summary.slowest.map((item) => `${item.label} ${formatMs(item.ms)}`).join(" · ")}
              </div>
            )}
            {wrongLabels.length > 0 && (
              <div className="text-xs">
                <span className="text-muted-foreground">错题：</span>
                <span>{wrongLabels.join(" · ")}</span>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={onRestart}>
                再来一组
              </Button>
              {wrongLabels.length > 0 && (
                <Button size="sm" onClick={onReviewWrong}>
                  只练本组错题
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
