let audioContext: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) audioContext = new Ctor();
  if (audioContext.state === "suspended") void audioContext.resume();
  return audioContext;
}

/* ---------------- 钢琴采样（public/piano/<midi>.mp3） ---------------- */

/** 采样覆盖的 MIDI 范围：C1–C7 = 键盘全音域（RANGES 最低 C1、最高 C7），低/高音区不再走合成兜底 */
export const PIANO_SAMPLE_LO = 24;
export const PIANO_SAMPLE_HI = 96;

const sampleBuffers = new Map<number, AudioBuffer>();
let preloadPromise: Promise<void> | null = null;

/** 预载全部钢琴采样；个别失败时该音自动退回合成音 */
export function preloadPiano(): Promise<void> {
  if (preloadPromise) return preloadPromise;
  preloadPromise = (async () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    const jobs: Promise<void>[] = [];
    for (let midi = PIANO_SAMPLE_LO; midi <= PIANO_SAMPLE_HI; midi++) {
      jobs.push(
        (async () => {
          try {
            const res = await fetch(`/piano/${midi}.mp3`);
            if (!res.ok) return;
            const raw = await res.arrayBuffer();
            const buffer = await ctx.decodeAudioData(raw);
            sampleBuffers.set(midi, buffer);
          } catch {
            /* 忽略，播放时用合成兜底 */
          }
        })(),
      );
    }
    await Promise.all(jobs);
  })();
  return preloadPromise;
}

/** 已就绪的采样数量（测试/诊断用） */
export function loadedSampleCount(): number {
  return sampleBuffers.size;
}

/**
 * 采样音量归一：FluidR3 钢琴采样峰值约 0.066–0.097（偏小），
 * 按实测峰值补偿到统一目标电平 1.12（乘上 0.22–0.26 的播放增益后约 0.25–0.29，
 * 与节拍器点击声同量级）。未知音高回退 1（不补偿）。
 */
const SAMPLE_TRIM: Record<number, number> = {
  24: 12.1, 25: 12.1, 26: 12.1, 27: 12.5, 28: 12.9, 29: 13.0,
  30: 12.3, 31: 12.3, 32: 12.6, 33: 12.6, 34: 13.1, 35: 12.4,
  36: 12.1, 37: 12.6, 38: 12.5, 39: 12.3, 40: 12.3, 41: 12.5,
  42: 12.4, 43: 13.2, 44: 12.9, 45: 12.1, 46: 12.9, 47: 12.8,
  48: 11.8, 49: 12.1, 50: 12.2, 51: 11.5, 52: 12.4, 53: 12.4,
  54: 11.6, 55: 13.5, 56: 13.7, 57: 14.2, 58: 14.1, 59: 12.7,
  60: 12.6, 61: 13.2, 62: 12.2, 63: 12.7, 64: 12.4, 65: 12.3,
  66: 12.2, 67: 12.5, 68: 12.5, 69: 12.9, 70: 12.8, 71: 13.3,
  72: 13.3, 73: 13.0, 74: 12.8, 75: 16.0, 76: 16.0, 77: 15.7,
  78: 16.8, 79: 12.5, 80: 13.6, 81: 14.0, 82: 14.9, 83: 14.2,
  84: 16.0, 85: 16.4, 86: 16.5, 87: 15.9, 88: 17.0, 89: 16.5,
  90: 16.8, 91: 12.6, 92: 12.7, 93: 12.6, 94: 12.7, 95: 12.4,
  96: 12.6,
};

/** 正在排程/发声的音，换题或切模式时可整体停掉 */
const activeVoices = new Set<AudioScheduledSourceNode>();

function trackVoice<T extends AudioScheduledSourceNode>(voice: T): T {
  activeVoices.add(voice);
  voice.onended = () => activeVoices.delete(voice);
  return voice;
}

/** 立即停掉所有已排程/正在发声的音（换题、切设置时调用） */
export function stopAllNotes() {
  for (const voice of activeVoices) {
    try {
      voice.stop();
    } catch {
      /* 已结束的节点会抛异常，忽略 */
    }
  }
  activeVoices.clear();
}

/**
 * 播放一段采样：到时值末尾后快速淡出，做到断奏/抬键可控。
 * managed=false 时不纳入 stopAllNotes（作答反馈音），切下一题也自然响完。
 */
function playSample(ctx: AudioContext, buffer: AudioBuffer, midi: number, duration: number, gain: number, t0: number, managed: boolean) {
  const raw = ctx.createBufferSource();
  const source = managed ? trackVoice(raw) : raw;
  source.buffer = buffer;
  const env = ctx.createGain();
  const out = ctx.createGain();
  out.gain.value = gain * (SAMPLE_TRIM[midi] ?? 1);
  const releaseAt = t0 + duration;
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.linearRampToValueAtTime(1, t0 + 0.004);
  env.gain.setValueAtTime(1, releaseAt);
  env.gain.exponentialRampToValueAtTime(0.0001, releaseAt + 0.045);
  source.connect(env).connect(out).connect(ctx.destination);
  source.start(t0);
  source.stop(releaseAt + 0.1);
}

/* ---------------- 合成兜底（采样缺失时使用） ---------------- */

/** 琴弦非谐性：f_n = n·f0·√(1+B·n²)，真实钢琴泛音略偏高 */
const INHARMONICITY = 0.0004;

/** [泛音次数, 相对幅度, 时值系数]，高泛音衰减更快 */
const SYNTH_PARTIALS: [number, number, number][] = [
  [1, 1, 1],
  [2, 0.5, 0.8],
  [3, 0.26, 0.62],
  [4, 0.15, 0.5],
  [5, 0.09, 0.42],
  [6, 0.055, 0.34],
  [7, 0.035, 0.28],
  [8, 0.02, 0.22],
];

let noiseBuffer: AudioBuffer | null = null;

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const length = Math.ceil(ctx.sampleRate * 0.05);
  noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 4);
  }
  return noiseBuffer;
}

function synthNote(ctx: AudioContext, midi: number, duration: number, gain: number, t0: number, managed: boolean) {
  const f0 = 440 * Math.pow(2, (midi - 69) / 12);
  const out = ctx.createGain();
  out.gain.value = gain;
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = Math.min(11000, Math.max(4500, f0 * 16));
  tone.Q.value = 0.4;
  out.connect(tone).connect(ctx.destination);

  for (const [n, level, decayScale] of SYNTH_PARTIALS) {
    const freq = n * f0 * Math.sqrt(1 + INHARMONICITY * n * n);
    if (freq > ctx.sampleRate / 2 - 200) break;
    const rawOsc = ctx.createOscillator();
    const osc = managed ? trackVoice(rawOsc) : rawOsc;
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t0);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(level, t0 + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration * (0.3 + 0.7 * decayScale));
    osc.connect(env).connect(out);
    osc.start(t0);
    osc.stop(t0 + duration + 0.15);
  }

  // 击弦瞬态
  const rawNoise = ctx.createBufferSource();
  const noise = managed ? trackVoice(rawNoise) : rawNoise;
  noise.buffer = getNoiseBuffer(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1600;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t0);
  ng.gain.exponentialRampToValueAtTime(0.09, t0 + 0.002);
  ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
  noise.connect(hp).connect(ng).connect(out);
  noise.start(t0);
}

/** 播放一个 MIDI 音高（60 = 中央C）。when 给定时按 AudioContext 时间精确排程；managed=false 时切题不会被停掉 */
export function playMidi(midi: number, duration = 1.1, gain = 0.2, when?: number, managed = true) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const t0 = when !== undefined ? Math.max(when, ctx.currentTime) : ctx.currentTime;
  const rounded = Math.round(midi);
  const buffer = sampleBuffers.get(rounded);
  if (buffer) {
    playSample(ctx, buffer, rounded, duration, gain, t0, managed);
    return;
  }
  synthNote(ctx, midi, duration, gain, t0, managed);
}

/** 播放钢琴键盘上的一个键（按完整音高，真实八度）。作答反馈音，切下一题时不中断 */
export function playKey(midi: number) {
  playMidi(midi, 1.0, 0.22, undefined, false);
}

/**
 * 节拍器点击声：在指定的 AudioContext 时间点响一下（提前调度用）。
 * accent = 强拍，音更高更响；volume = 总音量 0–1（UI 音量条）。
 */
export function scheduleClick(time: number, accent = false, volume = 1) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const freq = accent ? 1760 : 1174;
  const gain = (accent ? 0.52 : 0.34) * volume;

  for (const [multiple, level] of [
    [1, 1],
    [2.01, 0.32],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq * multiple, time);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(level * gain, time + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);

    osc.connect(env);
    env.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.07);
  }
}
