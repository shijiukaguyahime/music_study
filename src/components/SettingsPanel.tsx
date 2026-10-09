import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DEFAULT_RANGE, RANGES, type Clef } from "@/lib/music/theory";

interface SettingsPanelProps {
  clef: Clef;
  rangeId: string;
  allowAccidentals: boolean;
  onClefChange: (clef: Clef) => void;
  onRangeChange: (rangeId: string) => void;
  onAccidentalsChange: (value: boolean) => void;
}

export function SettingsPanel({
  clef,
  rangeId,
  allowAccidentals,
  onClefChange,
  onRangeChange,
  onAccidentalsChange,
}: SettingsPanelProps) {
  const ranges = RANGES[clef];

  return (
    <div className="grid gap-5 sm:grid-cols-3 sm:gap-6">
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
            onRangeChange(DEFAULT_RANGE[next]);
          }}
          className="w-full justify-stretch"
        >
          <ToggleGroupItem value="treble" className="flex-1">
            高音谱号
          </ToggleGroupItem>
          <ToggleGroupItem value="bass" className="flex-1">
            低音谱号
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
        <Separator className="sm:hidden" />
      </div>
    </div>
  );
}
