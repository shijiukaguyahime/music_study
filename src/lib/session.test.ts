import { describe, expect, it } from "vitest";
import {
  SESSION_STORAGE_KEY,
  emptySession,
  ensureSessions,
  loadSessions,
  recordSessionAnswer,
  saveSessions,
  summarizeSession,
} from "./session";
import type { SessionEntry } from "./session";
import { TRAIN_MODES } from "./settings";

function entry(key: string, correct: boolean, reactionMs: number): SessionEntry {
  return { key, label: key, correct, reactionMs };
}

describe("一组练习", () => {
  it("达到设定题数后结束，无限流不会结束", () => {
    let session = emptySession(2);
    session = recordSessionAnswer(session, entry("note:60", true, 500));
    expect(session.finished).toBe(false);
    session = recordSessionAnswer(session, entry("note:62", false, 900));
    expect(session.finished).toBe(true);
    expect(session.answered).toBe(2);
    expect(session.correct).toBe(1);

    let endless = emptySession(0);
    for (let index = 0; index < 60; index++) {
      endless = recordSessionAnswer(endless, entry(`note:${index}`, true, 300));
    }
    expect(endless.finished).toBe(false);
  });

  it("小结包含正确率、错题与最慢的音", () => {
    let session = emptySession(0);
    session = recordSessionAnswer(session, entry("note:60", true, 400));
    session = recordSessionAnswer(session, entry("note:60", true, 800));
    session = recordSessionAnswer(session, entry("note:64", false, 1500));
    const summary = summarizeSession(session, session.startedAt + 10_000);
    expect(summary.total).toBe(3);
    expect(summary.correct).toBe(2);
    expect(summary.accuracy).toBe(67);
    expect(summary.avgMs).toBe(900);
    expect(summary.medianMs).toBe(800);
    expect(summary.wrongKeys).toEqual(["note:64"]);
    expect(summary.slowest[0].key).toBe("note:64");
    expect(summary.durationMs).toBe(10_000);
  });

  it("无 localStorage 环境（测试环境）安全回落", () => {
    expect(loadSessions()).toEqual({});
    expect(() => saveSessions({})).not.toThrow();
  });

  it("每个训练模式各有一组，互不串题", () => {
    const sessions = ensureSessions({}, 20);
    expect(Object.keys(sessions).sort()).toEqual([...TRAIN_MODES].sort());
    TRAIN_MODES.forEach((mode) => expect(sessions[mode].answered).toBe(0));

    // 只给「单音」记两题，其他模式仍是干净的 0 题
    const note = recordSessionAnswer(sessions.note, entry("note:60", false, 800));
    const next = { ...sessions, note };
    expect(next.note.answered).toBe(1);
    expect(next.key.answered).toBe(0);
    expect(next.rhythm.answered).toBe(0);
    expect(summarizeSession(next.key).total).toBe(0);
  });
});

describe("按模式分桶的持久化与旧数据迁移", () => {
  const legacyKey = "musc_demo_session_v1";

  // 用内存版 localStorage 驱动持久化分支
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

  it("保存 / 读取分桶，非法模式与坏数据被丢弃", () => {
    withStorage(() => {
      const map = ensureSessions({}, 10);
      map.note = recordSessionAnswer(map.note, entry("note:60", true, 500));
      saveSessions(map);
      const loaded = loadSessions();
      expect(loaded.note?.answered).toBe(1);
      expect(loaded.key?.answered).toBe(0);
    });

    withStorage((store) => {
      store.set(SESSION_STORAGE_KEY, JSON.stringify({
        bogusMode: emptySession(10),
        note: { size: 999, answered: 5 },
        key: emptySession(20),
      }));
      const loaded = loadSessions();
      expect(Object.keys(loaded)).not.toContain("bogusMode");
      expect(loaded.note).toBeUndefined();
      expect(loaded.key?.size).toBe(20);
    });
  });

  it("旧版单一分组：题目前缀一致则归到该模式", () => {
    withStorage((store) => {
      let old = emptySession(20);
      old = recordSessionAnswer(old, entry("key:G", true, 600));
      old = recordSessionAnswer(old, entry("key:Bb", false, 900));
      store.set(legacyKey, JSON.stringify(old));
      const loaded = loadSessions();
      expect(loaded.key?.answered).toBe(2);
      expect(loaded.note).toBeUndefined();
    });
  });

  it("旧版单一分组混了多个模式（跨 tab 污染）则整体丢弃", () => {
    withStorage((store) => {
      let old = emptySession(20);
      old = recordSessionAnswer(old, entry("rhythm:4/4:q,8,8,q", true, 600));
      old = recordSessionAnswer(old, entry("key:G", false, 900));
      store.set(legacyKey, JSON.stringify(old));
      expect(loadSessions()).toEqual({});
    });
  });
});
