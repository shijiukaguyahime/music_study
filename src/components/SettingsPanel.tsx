import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MAX_NOTES, RANGES, type Clef } from "@/lib/music/theory";

export type TrainMode = "note" | "interval";

interface SettingsPanelProps {
  mode: TrainMode;
  clef: Clef;
  rangeId: string;
  allowAccidentals: boolean;
  noteCount: number;
  /** 音符显示时长（秒）的原始输入，空串/0 表示一直显示 */
  showDuration: string;
  onClefChange: (clef: Clef) => void;
  onRangeChange: (rangeId: string) => void;
  onAccidentalsChange: (value: boolean) => void;
  onNoteCountChange: (value: number) => void;
  onShowDurationChange: (value: string) => void;
}

export function SettingsPanel({
  mode,
  clef,
  rangeId,
  allowAccidentals,
  noteCount,
  showDuration,
  onClefChange,
  onRangeChange,
  onAccidentalsChange,
  onNoteCountChange,
  onShowDurationChange,
}: SettingsPanelProps) {
  const ranges = RANGES[clef];
  const parsedDuration = Number.parseFloat(showDuration);
  const showDurationSec = Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : 0;

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
      <div className="space-y-2">
        <Label>谱号</Label>
        <ToggleGroup
          type="single"
          variant="outline"
          size="default"
          value={clef}
          onValueChange={(value) => {
            if (!value) return;
            const next = value as Clef;
            onClefChange(next);
            onRangeChange(RANGES[next][0].id);
          }}
          className="w-full justify-stretch"
        >
          <ToggleGroupItem value="treble" className="flex-1">
            高音
          </ToggleGroupItem>
          <ToggleGroupItem value="bass" className="flex-1">
            低音
          </ToggleGroupItem>
          <ToggleGroupItem value="grand" className="flex-1">
            大谱表
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="space-y-2">
        <Label htmlFor="range-select">音的范围</Label>
        <Select value={rangeId} onValueChange={onRangeChange}>
          <SelectTrigger id="range-select" className="w-full min-w-0">
            <SelectValue className="truncate" placeholder="选择音域" />
          </SelectTrigger>
          <SelectContent>
            {ranges.map((range) => (
              <SelectItem key={range.id} value={range.id}>
                {range.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="accidentals-switch">升降号</Label>
        <div className="flex h-9 items-center justify-between rounded-md border border-input px-3">
          <span className="text-sm">包含 ♯ / ♭</span>
          <Switch
            id="accidentals-switch"
            checked={allowAccidentals}
            onCheckedChange={onAccidentalsChange}
          />
        </div>
      </div>

      {mode === "note" ? (
        <>
          <div className="space-y-2">
            <Label>音数</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              size="default"
              value={String(noteCount)}
              onValueChange={(value) => {
                if (!value) return;
                onNoteCountChange(Number(value));
              }}
              className="w-full justify-stretch"
            >
              {Array.from({ length: MAX_NOTES }, (_, index) => index + 1).map((value) => (
                <ToggleGroupItem key={value} value={String(value)} className="flex-1">
                  {value}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <p className="text-xs text-muted-foreground">
              {noteCount === 1 ? "认出单个音" : `${noteCount} 个音，从低到高依次按下`}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="show-duration">显示时长（秒）</Label>
            <Input
              id="show-duration"
              type="number"
              min={0}
              step={0.1}
              placeholder="常显"
              value={showDuration}
              onChange={(event) => onShowDurationChange(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {showDurationSec > 0 ? `音符显示 ${showDurationSec} 秒后隐藏` : "留空或 0 = 一直显示"}
            </p>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <Label>题型</Label>
          <div className="flex h-9 items-center rounded-md border border-input px-3 text-sm text-muted-foreground">
            识别两个音构成的音程
          </div>
        </div>
      )}
    </div>
  );
}
