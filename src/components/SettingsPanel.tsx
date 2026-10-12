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
import { CHORD_MODE_LABELS, chordRootLabels, type ChordModeId } from "@/lib/music/chord";

export type TrainMode = "note" | "interval" | "ear" | "chord";
export type ChordTask = "identify" | "play";
export type ChordScope = "triad" | "seventh" | "both";

interface SettingsPanelProps {
  mode: TrainMode;
  clef: Clef;
  rangeId: string;
  allowAccidentals: boolean;
  noteCount: number;
  /** 音符显示时长（秒）的原始输入，空串/0 表示一直显示 */
  showDuration: string;
  /** 练耳模式：是否每题播放引导音（标准音 + 音阶） */
  earGuide: boolean;
  chordMode: ChordModeId;
  chordRootPc: number;
  chordTask: ChordTask;
  chordDiatonic: boolean;
  chordScope: ChordScope;
  chordInversions: boolean;
  onClefChange: (clef: Clef) => void;
  onRangeChange: (rangeId: string) => void;
  onAccidentalsChange: (value: boolean) => void;
  onNoteCountChange: (value: number) => void;
  onShowDurationChange: (value: string) => void;
  onEarGuideChange: (value: boolean) => void;
  onChordModeChange: (mode: ChordModeId) => void;
  onChordRootChange: (pc: number) => void;
  onChordTaskChange: (task: ChordTask) => void;
  onChordDiatonicChange: (value: boolean) => void;
  onChordScopeChange: (scope: ChordScope) => void;
  onChordInversionsChange: (value: boolean) => void;
}

export function SettingsPanel({
  mode,
  clef,
  rangeId,
  allowAccidentals,
  noteCount,
  showDuration,
  earGuide,
  chordMode,
  chordRootPc,
  chordTask,
  chordDiatonic,
  chordScope,
  chordInversions,
  onClefChange,
  onRangeChange,
  onAccidentalsChange,
  onNoteCountChange,
  onShowDurationChange,
  onEarGuideChange,
  onChordModeChange,
  onChordRootChange,
  onChordTaskChange,
  onChordDiatonicChange,
  onChordScopeChange,
  onChordInversionsChange,
}: SettingsPanelProps) {
  const ranges = RANGES[clef];
  const parsedDuration = Number.parseFloat(showDuration);
  const showDurationSec = Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : 0;
  const rootLabels = chordRootLabels(chordMode);

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
      {mode !== "ear" && (
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
      )}

      {mode !== "ear" && (
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
      )}

      {mode !== "chord" && (
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
      )}

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
              {noteCount === 1 ? "认出单个音" : `${noteCount} 个音，顺序不限，全部弹出`}
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
      ) : mode === "ear" ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="ear-guide-switch">引导音</Label>
            <div className="flex h-9 items-center justify-between rounded-md border border-input px-3">
              <span className="text-sm">每题播放音阶引导</span>
              <Switch id="ear-guide-switch" checked={earGuide} onCheckedChange={onEarGuideChange} />
            </div>
            <p className="text-xs text-muted-foreground">
              {earGuide ? "标准音 A4 → 音阶 C4–C5 → 标准音 A4 ×2" : "只播要猜的那个音"}
            </p>
          </div>

          <div className="space-y-2">
            <Label>作答范围</Label>
            <div className="flex h-9 items-center rounded-md border border-input px-3 text-sm text-muted-foreground">
              C4 – B4（与键盘一致）
            </div>
          </div>
        </>
      ) : mode === "chord" ? (
        <>
          <div className="space-y-2">
            <Label>题型</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              size="default"
              value={chordTask}
              onValueChange={(value) => {
                if (value) onChordTaskChange(value as ChordTask);
              }}
              className="w-full justify-stretch"
            >
              <ToggleGroupItem value="identify" className="flex-1">
                认和弦
              </ToggleGroupItem>
              <ToggleGroupItem value="play" className="flex-1">
                弹和弦
              </ToggleGroupItem>
            </ToggleGroup>
            <p className="text-xs text-muted-foreground">
              {chordTask === "identify" ? "看谱选性质，调内题再选级数" : "看和弦标记，在键盘上弹出音"}
            </p>
          </div>

          <div className="space-y-2">
            <Label>题目来源</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              size="default"
              value={chordDiatonic ? "diatonic" : "any"}
              onValueChange={(value) => {
                if (value) onChordDiatonicChange(value === "diatonic");
              }}
              className="w-full justify-stretch"
            >
              <ToggleGroupItem value="diatonic" className="flex-1">
                调内和弦
              </ToggleGroupItem>
              <ToggleGroupItem value="any" className="flex-1">
                任意和弦
              </ToggleGroupItem>
            </ToggleGroup>
            <p className="text-xs text-muted-foreground">
              {chordDiatonic ? "按选定调式的级数出题" : "随机根音与性质，不考级数"}
            </p>
          </div>

          {chordDiatonic && (
            <div className="space-y-2">
              <Label>调式</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                size="default"
                value={chordMode}
                onValueChange={(value) => {
                  if (value) onChordModeChange(value as ChordModeId);
                }}
                className="w-full justify-stretch"
              >
                {(Object.keys(CHORD_MODE_LABELS) as ChordModeId[]).map((id) => (
                  <ToggleGroupItem key={id} value={id} className="flex-1 text-xs">
                    {CHORD_MODE_LABELS[id]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          )}

          {chordDiatonic && (
            <div className="space-y-2">
              <Label htmlFor="chord-key-select">调</Label>
              <Select
                value={String(chordRootPc)}
                onValueChange={(value) => onChordRootChange(Number(value))}
              >
                <SelectTrigger id="chord-key-select" className="w-full min-w-0">
                  <SelectValue placeholder="选择调" />
                </SelectTrigger>
                <SelectContent>
                  {rootLabels.map((label, pc) => (
                    <SelectItem key={pc} value={String(pc)}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>和弦范围</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              size="default"
              value={chordScope}
              onValueChange={(value) => {
                if (value) onChordScopeChange(value as ChordScope);
              }}
              className="w-full justify-stretch"
            >
              <ToggleGroupItem value="triad" className="flex-1">
                三和弦
              </ToggleGroupItem>
              <ToggleGroupItem value="seventh" className="flex-1">
                七和弦
              </ToggleGroupItem>
              <ToggleGroupItem value="both" className="flex-1">
                全部
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="chord-inversions-switch">转位</Label>
            <div className="flex h-9 items-center justify-between rounded-md border border-input px-3">
              <span className="text-sm">含转位</span>
              <Switch
                id="chord-inversions-switch"
                checked={chordInversions}
                onCheckedChange={onChordInversionsChange}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {chordInversions ? "三和弦 6/64，七和弦 65/43/42" : "只出根位和弦"}
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
