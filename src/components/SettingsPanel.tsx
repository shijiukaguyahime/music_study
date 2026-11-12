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
import { KEY_SIGNATURES } from "@/lib/music/keySignature";
import { LABEL_MODE_NAMES, type LabelMode } from "@/lib/music/labels";
import { MIDI_STATUS_TEXT, type MidiStatus } from "@/lib/midi";
import type {
  ChordScope, ChordTask, KeyQuizScope, MeterId, NoteLabelMode,
  Presentation, Settings,
} from "@/lib/settings";

export type { ChordScope, ChordTask, TrainMode } from "@/lib/settings";

interface SettingsPanelProps {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  midiStatus: MidiStatus;
}

const PRESENTATION_LABELS: Record<Presentation, string> = {
  visual: "看谱",
  aural: "听音",
  mixed: "混合",
};
const METERS: MeterId[] = ["2/4", "3/4", "4/4"];
const NOTE_LABEL_MODES: NoteLabelMode[] = ["letter", "solfege", "number"];

export function SettingsPanel({ settings, onChange, midiStatus }: SettingsPanelProps) {
  const { mode } = settings;
  const ranges = RANGES[settings.clef];
  const parsedDuration = Number.parseFloat(settings.showDuration);
  const showDurationSec = Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : 0;
  const rootLabels = chordRootLabels(settings.chordMode);

  const staffModes = mode === "note" || mode === "interval" || mode === "chord";
  const showAccidentals = mode === "note" || mode === "interval" || mode === "ear";
  const showPresentation = mode === "interval" || (mode === "chord" && settings.chordTask === "identify");

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
      {staffModes && (
        <div className="space-y-2">
          <Label>谱号</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            size="default"
            value={settings.clef}
            onValueChange={(value) => {
              if (!value) return;
              const clef = value as Clef;
              onChange({ clef, rangeId: RANGES[clef][0].id });
            }}
            className="w-full justify-stretch"
          >
            <ToggleGroupItem value="treble" className="flex-1">高音</ToggleGroupItem>
            <ToggleGroupItem value="bass" className="flex-1">低音</ToggleGroupItem>
            <ToggleGroupItem value="grand" className="flex-1">大谱表</ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}

      {staffModes && (
        <div className="space-y-2">
          <Label htmlFor="range-select">音的范围</Label>
          <Select value={settings.rangeId} onValueChange={(value) => onChange({ rangeId: value })}>
            <SelectTrigger id="range-select" className="w-full min-w-0">
              <SelectValue className="truncate" placeholder="选择音域" />
            </SelectTrigger>
            <SelectContent>
              {ranges.map((range) => (
                <SelectItem key={range.id} value={range.id}>{range.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {showAccidentals && (
        <div className="space-y-2">
          <Label htmlFor="accidentals-switch">升降号</Label>
          <div className="flex h-9 items-center justify-between rounded-md border border-input px-3">
            <span className="text-sm">包含 ♯ / ♭</span>
            <Switch
              id="accidentals-switch"
              checked={settings.allowAccidentals}
              onCheckedChange={(value) => onChange({ allowAccidentals: value })}
            />
          </div>
        </div>
      )}

      {mode === "note" && (
        <>
          <div className="space-y-2">
            <Label>音数</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              size="default"
              value={String(settings.noteCount)}
              onValueChange={(value) => { if (value) onChange({ noteCount: Number(value) }); }}
              className="w-full justify-stretch"
            >
              {Array.from({ length: MAX_NOTES }, (_, index) => index + 1).map((value) => (
                <ToggleGroupItem key={value} value={String(value)} className="flex-1">{value}</ToggleGroupItem>
              ))}
            </ToggleGroup>
            <p className="text-xs text-muted-foreground">
              {settings.noteCount === 1 ? "认出单个音" : `${settings.noteCount} 个音，顺序不限，全部弹出`}
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
              value={settings.showDuration}
              onChange={(event) => onChange({ showDuration: event.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              {showDurationSec > 0 ? `音符显示 ${showDurationSec} 秒后隐藏` : "留空或 0 = 一直显示"}
            </p>
          </div>
        </>
      )}

      {mode === "ear" && (
        <>
          <div className="space-y-2">
            <Label htmlFor="ear-guide-switch">引导音</Label>
            <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-input px-3">
              <span className="text-sm tabular-nums">1234567 · 6 · ？</span>
              <Switch
                id="ear-guide-switch"
                checked={settings.earGuideMode === "on"}
                onCheckedChange={(checked) => onChange({ earGuideMode: checked ? "on" : "off" })}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {settings.earGuideMode === "on"
                ? "音阶 1234567 → 标准音 6 → 出题音（90 BPM，约 3.7 秒）"
                : "直接播放要猜的那个音"}
            </p>
          </div>
          <div className="space-y-2">
            <Label>作答范围</Label>
            <div className="flex h-9 items-center rounded-md border border-input px-3 text-sm text-muted-foreground">
              C4 – B4（与键盘一致）
            </div>
          </div>
        </>
      )}

      {mode === "interval" && (
        <div className="space-y-2">
          <Label>题型</Label>
          <div className="flex h-9 items-center rounded-md border border-input px-3 text-sm text-muted-foreground">
            识别两个音构成的音程
          </div>
        </div>
      )}

      {mode === "chord" && (
        <>
          <div className="space-y-2">
            <Label>题型</Label>
            <ToggleGroup
              type="single" variant="outline" size="default"
              value={settings.chordTask}
              onValueChange={(value) => { if (value) onChange({ chordTask: value as ChordTask }); }}
              className="w-full justify-stretch"
            >
              <ToggleGroupItem value="identify" className="flex-1">认和弦</ToggleGroupItem>
              <ToggleGroupItem value="play" className="flex-1">弹和弦</ToggleGroupItem>
            </ToggleGroup>
            <p className="text-xs text-muted-foreground">
              {settings.chordTask === "identify" ? "看谱选性质，调内题再选级数" : "看和弦标记，在键盘上弹出音"}
            </p>
          </div>
          <div className="space-y-2">
            <Label>题目来源</Label>
            <ToggleGroup
              type="single" variant="outline" size="default"
              value={settings.chordDiatonic ? "diatonic" : "any"}
              onValueChange={(value) => { if (value) onChange({ chordDiatonic: value === "diatonic" }); }}
              className="w-full justify-stretch"
            >
              <ToggleGroupItem value="diatonic" className="flex-1">调内和弦</ToggleGroupItem>
              <ToggleGroupItem value="any" className="flex-1">任意和弦</ToggleGroupItem>
            </ToggleGroup>
          </div>
          {settings.chordDiatonic && (
            <>
              <div className="space-y-2">
                <Label>调式</Label>
                <ToggleGroup
                  type="single" variant="outline" size="default"
                  value={settings.chordMode}
                  onValueChange={(value) => { if (value) onChange({ chordMode: value as ChordModeId }); }}
                  className="w-full justify-stretch"
                >
                  {(Object.keys(CHORD_MODE_LABELS) as ChordModeId[]).map((id) => (
                    <ToggleGroupItem key={id} value={id} className="flex-1 text-xs">
                      {CHORD_MODE_LABELS[id]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
              <div className="space-y-2">
                <Label htmlFor="chord-key-select">调</Label>
                <Select value={String(settings.chordRootPc)} onValueChange={(value) => onChange({ chordRootPc: Number(value) })}>
                  <SelectTrigger id="chord-key-select" className="w-full min-w-0">
                    <SelectValue placeholder="选择调" />
                  </SelectTrigger>
                  <SelectContent>
                    {rootLabels.map((label, pc) => (
                      <SelectItem key={pc} value={String(pc)}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label>和弦范围</Label>
            <ToggleGroup
              type="single" variant="outline" size="default"
              value={settings.chordScope}
              onValueChange={(value) => { if (value) onChange({ chordScope: value as ChordScope }); }}
              className="w-full justify-stretch"
            >
              <ToggleGroupItem value="triad" className="flex-1">三和弦</ToggleGroupItem>
              <ToggleGroupItem value="seventh" className="flex-1">七和弦</ToggleGroupItem>
              <ToggleGroupItem value="both" className="flex-1">全部</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="space-y-2">
            <Label htmlFor="chord-inversions-switch">转位</Label>
            <div className="flex h-9 items-center justify-between rounded-md border border-input px-3">
              <span className="text-sm">含转位</span>
              <Switch
                id="chord-inversions-switch"
                checked={settings.chordInversions}
                onCheckedChange={(value) => onChange({ chordInversions: value })}
              />
            </div>
          </div>
        </>
      )}

      {(mode === "rhythm" || mode === "sightread") && (
        <>
          <div className="space-y-2">
            <Label>拍号</Label>
            <ToggleGroup
              type="single" variant="outline" size="default"
              value={settings.meter}
              onValueChange={(value) => { if (value) onChange({ meter: value as MeterId }); }}
              className="w-full justify-stretch"
            >
              {METERS.map((meter) => (
                <ToggleGroupItem key={meter} value={meter} className="flex-1">{meter}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="space-y-2">
            <Label htmlFor="quiz-bpm">速度（BPM）</Label>
            <Input
              id="quiz-bpm"
              type="number"
              min={30}
              max={260}
              value={settings.bpm}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value)) onChange({ bpm: Math.min(260, Math.max(30, Math.round(value))) });
              }}
            />
            <p className="text-xs text-muted-foreground">与节拍器、乐句视唱共用速度</p>
          </div>
          {mode === "sightread" && (
            <div className="space-y-2">
              <Label htmlFor="sightread-countin">预备拍</Label>
              <div className="flex h-9 items-center justify-between rounded-md border border-input px-3">
                <span className="text-sm">一整小节</span>
                <Switch
                  id="sightread-countin"
                  checked={settings.countIn}
                  onCheckedChange={(value) => onChange({ countIn: value })}
                />
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label>题型</Label>
            <div className="flex h-9 items-center rounded-md border border-input px-3 text-xs text-muted-foreground">
              {mode === "rhythm" ? "听一小节节奏，选出时值组合" : "看谱跟着拍子逐音弹出"}
            </div>
          </div>
        </>
      )}

      {mode === "key" && (
        <>
          <div className="space-y-2">
            <Label>认调号范围</Label>
            <ToggleGroup
              type="single" variant="outline" size="default"
              value={settings.keyQuizScope}
              onValueChange={(value) => { if (value) onChange({ keyQuizScope: value as KeyQuizScope }); }}
              className="w-full justify-stretch"
            >
              <ToggleGroupItem value="major" className="flex-1">大调</ToggleGroupItem>
              <ToggleGroupItem value="minor" className="flex-1">小调</ToggleGroupItem>
              <ToggleGroupItem value="both" className="flex-1">全部</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="space-y-2">
            <Label>题型</Label>
            <div className="flex h-9 items-center rounded-md border border-input px-3 text-xs text-muted-foreground">
              看谱号后的升降号，选出调名
            </div>
          </div>
        </>
      )}

      {/* ---------- 通用训练设置 ---------- */}
      {showPresentation && (
        <div className="space-y-2">
          <Label>呈现方式</Label>
          <ToggleGroup
            type="single" variant="outline" size="default"
            value={settings.presentation}
            onValueChange={(value) => { if (value) onChange({ presentation: value as Presentation }); }}
            className="w-full justify-stretch"
          >
            {(Object.keys(PRESENTATION_LABELS) as Presentation[]).map((id) => (
              <ToggleGroupItem key={id} value={id} className="flex-1 text-xs">
                {PRESENTATION_LABELS[id]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-xs text-muted-foreground">
            {settings.presentation === "visual"
              ? "只看谱面作答"
              : settings.presentation === "aural"
                ? "隐藏谱面，听音作答"
                : "每题随机看谱或听音"}
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label>答案标记</Label>
        <ToggleGroup
          type="single" variant="outline" size="default"
          value={settings.noteLabelMode}
          onValueChange={(value) => { if (value) onChange({ noteLabelMode: value as NoteLabelMode }); }}
          className="w-full justify-stretch"
        >
          {NOTE_LABEL_MODES.map((id) => (
            <ToggleGroupItem key={id} value={id} className="flex-1 text-xs">
              {LABEL_MODE_NAMES[id as LabelMode]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-xs text-muted-foreground">首调唱名 / 简谱数字按 C 大调主音换算</p>
      </div>

      {mode !== "key" && (
        <div className="space-y-2">
          <Label htmlFor="key-sig-switch">谱面调号</Label>
          <div className="flex h-9 items-center justify-between rounded-md border border-input px-3">
            <span className="text-sm">显示调号</span>
            <Switch
              id="key-sig-switch"
              checked={settings.showKeySignature}
              onCheckedChange={(value) => onChange({ showKeySignature: value })}
            />
          </div>
          {settings.showKeySignature && (
            <Select value={settings.keySig} onValueChange={(value) => onChange({ keySig: value })}>
              <SelectTrigger className="w-full min-w-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {KEY_SIGNATURES.filter((item) => item.spec !== "Am").map((item) => (
                  <SelectItem key={item.spec} value={item.spec}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="midi-switch">MIDI 键盘</Label>
        <div className="flex h-9 items-center justify-between rounded-md border border-input px-3">
          <span className="text-sm">接入 Web MIDI</span>
          <Switch
            id="midi-switch"
            checked={settings.midiEnabled}
            onCheckedChange={(value) => onChange({ midiEnabled: value })}
          />
        </div>
        {settings.midiEnabled && (
          <p className="text-xs text-muted-foreground">{MIDI_STATUS_TEXT[midiStatus]}</p>
        )}
      </div>
    </div>
  );
}
