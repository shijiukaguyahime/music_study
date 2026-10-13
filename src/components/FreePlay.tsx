import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { playMidi } from "@/lib/audio";
import { WHITE_PCS, midiLabel, pcOf } from "@/lib/music/theory";

interface RowDef {
  /** 该排 C 的完整音高 */
  base: number;
  /** 7 个白键的 KeyboardEvent.code，顺序 C D E F G A B */
  codes: string[];
}

/** 四排 12 音，自上而下 C6→C3，与物理键盘四行一一对应 */
const ROWS: RowDef[] = [
  { base: 84, codes: ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7"] },
  { base: 72, codes: ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU"] },
  { base: 60, codes: ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ"] },
  { base: 48, codes: ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM"] },
];

/** 上方有黑键（可升半音）的白键音级：C D F G A；E/B 无黑键，Shift 不生效 */
const SHARPABLE_PCS = new Set([0, 2, 5, 7, 9]);

const SHORTCUT_BY_CODE: Record<string, string> = Object.fromEntries(
  ROWS.flatMap((row) =>
    row.codes.map((code) => [code, code.startsWith("Digit") ? code.slice(5) : code.slice(3)]),
  ),
);

/** e.code + Shift 状态 → 完整音高；E/B 键忽略 Shift（上方无黑键） */
function resolveMidi(code: string, shift: boolean): number | null {
  for (const row of ROWS) {
    const index = row.codes.indexOf(code);
    if (index < 0) continue;
    const pc = WHITE_PCS[index];
    return row.base + pc + (shift && SHARPABLE_PCS.has(pc) ? 1 : 0);
  }
  return null;
}

export function FreePlay() {
  const [held, setHeld] = useState<number[]>([]);
  /** 按下时记录 code→midi，keyup 按记录释放（避免按住期间 Shift 状态变化对不上） */
  const codeMidiRef = useRef(new Map<string, number>());

  const press = useCallback((midi: number) => {
    playMidi(midi, 1.5, 0.22);
    setHeld((prev) => (prev.includes(midi) ? prev : [...prev, midi]));
  }, []);

  const release = useCallback((midi: number) => {
    setHeld((prev) => prev.filter((item) => item !== midi));
  }, []);

  const releaseAll = useCallback(() => {
    codeMidiRef.current.clear();
    setHeld([]);
  }, []);

  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const midi = resolveMidi(event.code, event.shiftKey);
      if (midi === null) return;
      event.preventDefault();
      if (codeMidiRef.current.has(event.code)) return;
      codeMidiRef.current.set(event.code, midi);
      press(midi);
    };
    const onUp = (event: KeyboardEvent) => {
      const midi = codeMidiRef.current.get(event.code);
      if (midi === undefined) return;
      codeMidiRef.current.delete(event.code);
      release(midi);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", releaseAll);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", releaseAll);
    };
  }, [press, release, releaseAll]);

  return (
    <div className="space-y-4" role="group" aria-label="自由演奏键盘">
      <div className="space-y-3">
        {ROWS.map((row) => {
          const whites: number[] = [];
          const blacks: number[] = [];
          for (let midi = row.base; midi <= row.base + 11; midi += 1) {
            (WHITE_PCS.includes(pcOf(midi)) ? whites : blacks).push(midi);
          }
          const shortcutText = row.codes.map((code) => SHORTCUT_BY_CODE[code]).join(" ");
          return (
            <div key={row.base}>
              <div className="mb-1 flex items-baseline justify-between text-[11px] text-muted-foreground">
                <span>
                  <span className="font-medium text-foreground">{midiLabel(row.base)}–{midiLabel(row.base + 11)}</span>
                  <span className="ml-2 hidden sm:inline">快捷键 {shortcutText}，Shift 升半音</span>
                </span>
              </div>
              <div
                className="relative flex h-[clamp(76px,12.5vw,112px)] w-full touch-manipulation"
                style={
                  {
                    "--wk": `calc(100% / ${whites.length})`,
                    "--bk": "calc(var(--wk) * 0.62)",
                  } as React.CSSProperties
                }
                data-octave={row.base}
              >
                {whites.map((midi, index) => {
                  const code = row.codes[index];
                  return (
                    <button
                      key={midi}
                      type="button"
                      className={cn(
                        "relative flex-1 cursor-pointer rounded-b-[6px] border border-r-0 border-neutral-300 bg-white",
                        "flex flex-col items-center justify-center gap-0.5 transition-colors duration-150",
                        "last:border-r hover:bg-neutral-100 active:bg-neutral-200",
                        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                        held.includes(midi) && "bg-neutral-200 hover:bg-neutral-200",
                      )}
                      aria-label={`${midiLabel(midi)}，快捷键 ${SHORTCUT_BY_CODE[code]}`}
                      data-midi={midi}
                      data-code={code}
                      data-held={held.includes(midi) ? "1" : "0"}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        press(midi);
                      }}
                      onPointerUp={() => release(midi)}
                      onPointerCancel={() => release(midi)}
                    >
                      <span className="text-sm font-semibold tabular-nums">{SHORTCUT_BY_CODE[code]}</span>
                      <span className="text-[10px] tabular-nums text-neutral-400">{midiLabel(midi)}</span>
                    </button>
                  );
                })}

                {blacks.map((midi) => {
                  const pc = pcOf(midi);
                  const leftWhites = WHITE_PCS.filter((white) => white < pc).length;
                  const leftCode = row.codes[leftWhites - 1];
                  return (
                    <button
                      key={midi}
                      type="button"
                      className={cn(
                        "absolute top-0 z-10 h-[62%] cursor-pointer rounded-b-[5px] border border-black/40",
                        "flex items-end justify-center pb-1.5 text-[10px] font-medium text-neutral-400",
                        "bg-neutral-900 shadow-[0_3px_0_rgba(0,0,0,0.35)] transition-colors duration-150",
                        "hover:bg-neutral-700 active:bg-neutral-600",
                        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                        held.includes(midi) && "bg-neutral-700 hover:bg-neutral-700",
                      )}
                      style={{ left: `calc(var(--wk) * ${leftWhites} - var(--bk) / 2)`, width: "var(--bk)" }}
                      aria-label={`${midiLabel(midi)}，快捷键 Shift 加 ${SHORTCUT_BY_CODE[leftCode]}`}
                      data-midi={midi}
                      data-held={held.includes(midi) ? "1" : "0"}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        press(midi);
                      }}
                      onPointerUp={() => release(midi)}
                      onPointerCancel={() => release(midi)}
                    >
                      <span className="tabular-nums">⇧{SHORTCUT_BY_CODE[leftCode]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-md bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        点击琴键或用键盘演奏：第 1 排 1–7 = C6–B6，第 2 排 Q–U = C5–B5，第 3 排 A–J = C4–B4，第
        4 排 Z–M = C3–B3。黑键没有独立快捷键：按住 Shift 再按 C/D/F/G/A 对应的白键升半音（如
        Shift+Z = C♯3），松开 Shift 后按同一键还原为本音；E、B 上方无黑键，Shift 不生效。
      </div>
    </div>
  );
}
