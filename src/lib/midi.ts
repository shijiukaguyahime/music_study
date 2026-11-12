import { useEffect, useRef, useState } from "react";

export type MidiStatus = "off" | "unsupported" | "denied" | "ready";

interface MidiMessageEvent {
  data: Uint8Array | number[];
}

interface MidiInputLike {
  onmidimessage: ((event: MidiMessageEvent) => void) | null;
}

interface MidiAccessLike {
  inputs: { forEach: (callback: (input: MidiInputLike) => void) => void };
  onstatechange: ((event: unknown) => void) | null;
}

/**
 * Web MIDI 输入：开启后向浏览器申请授权，把 MIDI 键盘按下的音高
 * 交给与屏幕键盘相同的作答回调。浏览器不支持 / 用户拒绝时给出状态提示。
 */
export function useMidiInput(enabled: boolean, onNote: (midi: number) => void): MidiStatus {
  const [status, setStatus] = useState<MidiStatus>("off");
  const handlerRef = useRef(onNote);
  handlerRef.current = onNote;

  useEffect(() => {
    if (!enabled) {
      setStatus("off");
      return;
    }
    const nav = navigator as Navigator & {
      requestMIDIAccess?: () => Promise<MidiAccessLike>;
    };
    if (typeof nav.requestMIDIAccess !== "function") {
      setStatus("unsupported");
      return;
    }

    let cancelled = false;
    const bound: { input: MidiInputLike; previous: MidiInputLike["onmidimessage"] }[] = [];
    const attach = (input: MidiInputLike) => {
      if (bound.some((item) => item.input === input)) return;
      const previous = input.onmidimessage;
      input.onmidimessage = (event) => {
        const [code, note, velocity] = event.data;
        // 0x90 = Note On；velocity 0 等价于 Note Off
        if ((code & 0xf0) === 0x90 && velocity > 0) handlerRef.current(note);
      };
      bound.push({ input, previous });
    };

    nav
      .requestMIDIAccess()
      .then((raw) => {
        if (cancelled) return;
        // 各浏览器暴露的 MIDIAccess 结构一致，这里用最小接口避免依赖具体 DOM 版本
        const access = raw as unknown as MidiAccessLike;
        access.inputs.forEach(attach);
        access.onstatechange = () => access.inputs.forEach(attach);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("denied");
      });

    return () => {
      cancelled = true;
      bound.forEach(({ input, previous }) => {
        input.onmidimessage = previous;
      });
    };
  }, [enabled]);

  return status;
}

export const MIDI_STATUS_TEXT: Record<MidiStatus, string> = {
  off: "未开启",
  unsupported: "当前浏览器不支持 Web MIDI（可用 Chrome / Edge）",
  denied: "MIDI 授权被拒绝，可在浏览器地址栏权限里重新允许",
  ready: "已连接，可直接用 MIDI 键盘作答",
};
