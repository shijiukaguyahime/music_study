import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, loadSettings, normalizeSettings, saveSettings } from "./settings";

describe("设置持久化", () => {
  it("空值 / 非法类型 / 空对象都回落到默认值", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("not an object")).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it("枚举字段只接受白名单里的值", () => {
    const settings = normalizeSettings({
      mode: "bogus",
      clef: "alto",
      earGuideMode: "long",
      meter: "7/8",
      chordTask: "sing",
      phraseKeyMode: "harmonicMinor",
    });
    expect(settings.mode).toBe(DEFAULT_SETTINGS.mode);
    expect(settings.clef).toBe(DEFAULT_SETTINGS.clef);
    expect(settings.earGuideMode).toBe(DEFAULT_SETTINGS.earGuideMode);
    expect(settings.meter).toBe(DEFAULT_SETTINGS.meter);
    expect(settings.chordTask).toBe(DEFAULT_SETTINGS.chordTask);
    expect(settings.phraseKeyMode).toBe(DEFAULT_SETTINGS.phraseKeyMode);
  });

  it("早期 short / full 引导档位统一迁移到 on", () => {
    expect(normalizeSettings({ earGuideMode: "short" }).earGuideMode).toBe("on");
    expect(normalizeSettings({ earGuideMode: "full" }).earGuideMode).toBe("on");
    expect(normalizeSettings({ earGuideMode: "off" }).earGuideMode).toBe("off");
  });

  it("新增枚举字段只接受白名单里的值", () => {
    const settings = normalizeSettings({
      sessionSize: 7,
      presentation: "smell",
      noteLabelMode: "roman",
      keyQuizScope: "pentatonic",
      weaknessSort: "random",
      keySig: "H#",
    });
    expect(settings.sessionSize).toBe(DEFAULT_SETTINGS.sessionSize);
    expect(settings.presentation).toBe(DEFAULT_SETTINGS.presentation);
    expect(settings.noteLabelMode).toBe(DEFAULT_SETTINGS.noteLabelMode);
    expect(settings.keyQuizScope).toBe(DEFAULT_SETTINGS.keyQuizScope);
    expect(settings.weaknessSort).toBe(DEFAULT_SETTINGS.weaknessSort);
    expect(settings.keySig).toBe(DEFAULT_SETTINGS.keySig);
  });

  it("新增字段的合法值原样保留", () => {
    const settings = normalizeSettings({
      sessionSize: 10,
      presentation: "aural",
      noteLabelMode: "solfege",
      showKeySignature: true,
      keySig: "Bb",
      keyQuizScope: "minor",
      weaknessSort: "slow",
      midiEnabled: true,
      mode: "sightread",
    });
    expect(settings.sessionSize).toBe(10);
    expect(settings.presentation).toBe("aural");
    expect(settings.noteLabelMode).toBe("solfege");
    expect(settings.showKeySignature).toBe(true);
    expect(settings.keySig).toBe("Bb");
    expect(settings.keyQuizScope).toBe("minor");
    expect(settings.weaknessSort).toBe("slow");
    expect(settings.midiEnabled).toBe(true);
    expect(settings.mode).toBe("sightread");
  });

  it("数值字段 clamp 到合法范围", () => {
    const settings = normalizeSettings({
      bpm: 999,
      chordRootPc: 42,
      noteCount: 99,
      metronomeVolume: 500,
      phraseBars: 3,
    });
    expect(settings.bpm).toBe(260);
    expect(settings.chordRootPc).toBe(11);
    expect(settings.noteCount).toBe(4);
    expect(settings.metronomeVolume).toBe(100);
    expect(settings.phraseBars).toBe(2);
  });

  it("合法值原样保留，缺字段用默认值补齐", () => {
    const settings = normalizeSettings({
      mode: "ear",
      clef: "grand",
      earGuideMode: "off",
      bpm: 132,
      wrongManualNext: false,
      focusWeak: true,
    });
    expect(settings.mode).toBe("ear");
    expect(settings.clef).toBe("grand");
    expect(settings.earGuideMode).toBe("off");
    expect(settings.bpm).toBe(132);
    expect(settings.wrongManualNext).toBe(false);
    expect(settings.focusWeak).toBe(true);
    expect(settings.noteCount).toBe(DEFAULT_SETTINGS.noteCount);
  });

  it("布尔字段只接受布尔值", () => {
    const settings = normalizeSettings({ countIn: "yes", allowAccidentals: 1 });
    expect(settings.countIn).toBe(DEFAULT_SETTINGS.countIn);
    expect(settings.allowAccidentals).toBe(DEFAULT_SETTINGS.allowAccidentals);
  });

  it("无 localStorage 环境（测试环境）安全回落且写入不抛错", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(DEFAULT_SETTINGS)).not.toThrow();
  });
});

describe("手动下一题默认开启的一次性迁移", () => {
  const SETTINGS_KEY = "musc_demo_settings_v1";
  const MIGRATION_KEY = "musc_demo_manual_next_on_v1";

  function withStorage(run: (store: Map<string, string>) => void) {
    const store = new Map<string, string>();
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value); },
        removeItem: (key: string) => { store.delete(key); },
      },
    });
    try {
      run(store);
    } finally {
      if (original === undefined) Reflect.deleteProperty(globalThis, "localStorage");
      else Object.defineProperty(globalThis, "localStorage", { configurable: true, value: original });
    }
  }

  it("旧数据存的是关闭：首次加载统一回到开启，之后尊重用户开关", () => {
    withStorage((store) => {
      store.set(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, wrongManualNext: false }));
      const first = loadSettings();
      expect(first.wrongManualNext).toBe(true);
      expect(store.has(MIGRATION_KEY)).toBe(true);
      // 迁移只做一次：之后用户主动关掉会被保留
      saveSettings({ ...first, wrongManualNext: false });
      const second = loadSettings();
      expect(second.wrongManualNext).toBe(false);
    });
  });

  it("没有持久化数据时不写迁移标记，直接走默认值", () => {
    withStorage((store) => {
      expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
      expect(store.has(MIGRATION_KEY)).toBe(false);
    });
  });

  it("新装用户默认就是手动下一题开启", () => {
    expect(DEFAULT_SETTINGS.wrongManualNext).toBe(true);
  });
});
