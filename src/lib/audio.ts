let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) audioContext = new Ctor();
  if (audioContext.state === "suspended") void audioContext.resume();
  return audioContext;
}

/** 相对泛音：[倍频, 音量, 衰减系数]，高泛音衰减更快更像钢琴 */
const PARTIALS: [number, number, number][] = [
  [1, 1, 1],
  [2, 0.42, 1.35],
  [3, 0.2, 1.7],
  [4, 0.11, 2.1],
  [5.02, 0.06, 2.5],
];

/** 播放一个 MIDI 音高（60 = 中央C） */
export function playMidi(midi: number, duration = 1.1, gain = 0.2) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const t0 = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = gain;
  master.connect(ctx.destination);

  for (const [multiple, level, decay] of PARTIALS) {
    const osc = ctx.createOscillator();
    osc.type = multiple === 1 ? "triangle" : "sine";
    osc.frequency.setValueAtTime(freq * multiple, t0);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(level, t0 + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration / decay);

    osc.connect(env);
    env.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  master.gain.setValueAtTime(gain, t0);
  master.gain.exponentialRampToValueAtTime(0.0001, t0 + duration + 0.06);
}

/** 播放钢琴键盘上的一个键（按音级，固定在 C4–B4 这一组） */
export function playKey(pc: number) {
  playMidi(60 + pc, 1.0, 0.22);
}
