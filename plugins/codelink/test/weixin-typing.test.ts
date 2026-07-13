import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultConfig } from "../src/config.js";
import type { WeixinSession } from "../src/state.js";
import { WeixinClient } from "../src/weixin/client.js";
import { WeixinTypingIndicator } from "../src/weixin/typing.js";

const session: WeixinSession = {
  accountId: "bot",
  token: "token",
  userId: "owner",
  baseUrl: "https://ilinkai.weixin.qq.com",
  savedAt: "now",
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("WeixinTypingIndicator", () => {
  it("starts typing around work, preserves its result, and cancels afterwards", async () => {
    const setTyping = vi.fn<WeixinClient["setTyping"]>(
      async () => undefined,
    );
    const indicator = new WeixinTypingIndicator({
      setTyping,
    } as unknown as WeixinClient);

    const result = await indicator.during(
      {
        session,
        toUserId: "owner",
        contextToken: "ctx",
      },
      async () => "task result",
    );

    expect(result).toBe("task result");
    expect(setTyping.mock.calls.map(([input]) => input.typing)).toEqual([
      true,
      false,
    ]);
  });

  it("refreshes typing every five seconds until the work finishes", async () => {
    vi.useFakeTimers();
    const setTyping = vi.fn<WeixinClient["setTyping"]>(
      async () => undefined,
    );
    const indicator = new WeixinTypingIndicator({
      setTyping,
    } as unknown as WeixinClient);
    let finish!: () => void;
    const work = new Promise<void>((resolve) => {
      finish = resolve;
    });

    const running = indicator.during(
      { session, toUserId: "owner", contextToken: "ctx" },
      () => work,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(setTyping.mock.calls.map(([input]) => input.typing)).toEqual([
      true,
    ]);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(setTyping.mock.calls.map(([input]) => input.typing)).toEqual([
      true,
      true,
      true,
    ]);

    finish();
    await running;
    expect(setTyping.mock.calls.map(([input]) => input.typing)).toEqual([
      true,
      true,
      true,
      false,
    ]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(setTyping).toHaveBeenCalledTimes(4);
  });

  it("does not queue keepalives while a previous typing update is slow", async () => {
    vi.useFakeTimers();
    let finishFirstUpdate!: () => void;
    const firstUpdate = new Promise<void>((resolve) => {
      finishFirstUpdate = resolve;
    });
    const setTyping = vi
      .fn<WeixinClient["setTyping"]>()
      .mockImplementationOnce(async () => firstUpdate)
      .mockResolvedValue(undefined);
    const indicator = new WeixinTypingIndicator({ setTyping });
    let finishWork!: () => void;
    const work = new Promise<void>((resolve) => {
      finishWork = resolve;
    });
    const running = indicator.during(
      { session, toUserId: "owner", contextToken: "ctx" },
      () => work,
    );
    await vi.advanceTimersByTimeAsync(20_000);
    expect(setTyping).toHaveBeenCalledTimes(1);

    finishFirstUpdate();
    await vi.advanceTimersByTimeAsync(0);
    const callsAfterSlowUpdate = setTyping.mock.calls.length;
    finishWork();
    await running;

    expect(callsAfterSlowUpdate).toBe(1);
  });

  it("backs off silently and recovers after two typing failures", async () => {
    vi.useFakeTimers();
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    let failedAttempts = 0;
    const setTyping = vi.fn<WeixinClient["setTyping"]>(async (input) => {
      if (input.typing && failedAttempts < 2) {
        failedAttempts += 1;
        throw new Error("typing unavailable");
      }
    });
    const indicator = new WeixinTypingIndicator({ setTyping });
    let finishWork!: () => void;
    const work = new Promise<void>((resolve) => {
      finishWork = resolve;
    });
    const running = indicator.during(
      { session, toUserId: "owner", contextToken: "ctx" },
      () => work,
    );

    await vi.advanceTimersByTimeAsync(60_000);
    expect(
      setTyping.mock.calls.filter(([input]) => input.typing),
    ).toHaveLength(2);
    expect(stderr).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(
      setTyping.mock.calls.filter(([input]) => input.typing),
    ).toHaveLength(3);
    expect(stderr).toHaveBeenCalledTimes(2);

    finishWork();
    await running;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(setTyping).toHaveBeenCalledTimes(4);
  });

  it("retries a backed-off typing state when new work arrives", async () => {
    vi.useFakeTimers();
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    let failedAttempts = 0;
    const setTyping = vi.fn<WeixinClient["setTyping"]>(async (input) => {
      if (input.typing && failedAttempts < 2) {
        failedAttempts += 1;
        throw new Error("typing unavailable");
      }
    });
    const indicator = new WeixinTypingIndicator({ setTyping });
    let finishFirst!: () => void;
    let finishSecond!: () => void;
    const firstWork = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const secondWork = new Promise<void>((resolve) => {
      finishSecond = resolve;
    });
    const target = { session, toUserId: "owner", contextToken: "ctx" };
    const first = indicator.during(target, () => firstWork);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(
      setTyping.mock.calls.filter(([input]) => input.typing),
    ).toHaveLength(2);

    const second = indicator.during(target, () => secondWork);
    await vi.advanceTimersByTimeAsync(0);
    expect(
      setTyping.mock.calls.filter(([input]) => input.typing),
    ).toHaveLength(3);

    finishFirst();
    finishSecond();
    await Promise.all([first, second]);
  });

  it("keeps one typing state until all concurrent work for a user finishes", async () => {
    const setTyping = vi.fn<WeixinClient["setTyping"]>(
      async () => undefined,
    );
    const indicator = new WeixinTypingIndicator({
      setTyping,
    } as unknown as WeixinClient);
    let finishFirst!: () => void;
    let finishSecond!: () => void;
    const firstWork = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const secondWork = new Promise<void>((resolve) => {
      finishSecond = resolve;
    });
    const target = { session, toUserId: "owner", contextToken: "ctx" };

    const first = indicator.during(target, () => firstWork);
    const second = indicator.during(target, () => secondWork);
    await vi.waitFor(() => expect(setTyping).toHaveBeenCalledTimes(1));

    finishFirst();
    await first;
    expect(setTyping.mock.calls.map(([input]) => input.typing)).toEqual([
      true,
    ]);

    finishSecond();
    await second;
    expect(setTyping.mock.calls.map(([input]) => input.typing)).toEqual([
      true,
      false,
    ]);
  });

  it("preserves task completion when typing updates fail", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const setTyping = vi.fn<WeixinClient["setTyping"]>(async () => {
      throw new Error("typing unavailable");
    });
    const indicator = new WeixinTypingIndicator({ setTyping });

    await expect(
      indicator.during(
        { session, toUserId: "owner", contextToken: "ctx" },
        async () => "Codex answer",
      ),
    ).resolves.toBe("Codex answer");
    expect(setTyping.mock.calls.map(([input]) => input.typing)).toEqual([
      true,
      false,
    ]);
  });

  it("cancels typing and preserves the original task failure", async () => {
    const setTyping = vi.fn<WeixinClient["setTyping"]>(
      async () => undefined,
    );
    const indicator = new WeixinTypingIndicator({ setTyping });
    const taskFailure = new Error("Codex task failed");

    await expect(
      indicator.during(
        { session, toUserId: "owner", contextToken: "ctx" },
        async () => {
          throw taskFailure;
        },
      ),
    ).rejects.toBe(taskFailure);
    expect(setTyping.mock.calls.map(([input]) => input.typing)).toEqual([
      true,
      false,
    ]);
  });

  it("cancels active typing once when the indicator shuts down", async () => {
    vi.useFakeTimers();
    const setTyping = vi.fn<WeixinClient["setTyping"]>(
      async () => undefined,
    );
    const indicator = new WeixinTypingIndicator({ setTyping });
    let finishWork!: () => void;
    const work = new Promise<void>((resolve) => {
      finishWork = resolve;
    });
    const running = indicator.during(
      { session, toUserId: "owner", contextToken: "ctx" },
      () => work,
    );
    await vi.advanceTimersByTimeAsync(0);

    await indicator.stop();
    expect(setTyping.mock.calls.map(([input]) => input.typing)).toEqual([
      true,
      false,
    ]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(setTyping).toHaveBeenCalledTimes(2);

    finishWork();
    await running;
    expect(setTyping).toHaveBeenCalledTimes(2);
  });

  it("shares an in-flight cancellation between task release and shutdown", async () => {
    let finishWork!: () => void;
    const work = new Promise<void>((resolve) => {
      finishWork = resolve;
    });
    let finishCancellation!: () => void;
    const cancellation = new Promise<void>((resolve) => {
      finishCancellation = resolve;
    });
    const setTyping = vi.fn<WeixinClient["setTyping"]>(async (input) => {
      if (!input.typing) await cancellation;
    });
    const indicator = new WeixinTypingIndicator({ setTyping });
    const running = indicator.during(
      { session, toUserId: "owner", contextToken: "ctx" },
      () => work,
    );
    await vi.waitFor(() => expect(setTyping).toHaveBeenCalledTimes(1));

    finishWork();
    await vi.waitFor(() => expect(setTyping).toHaveBeenCalledTimes(2));
    const stopping = indicator.stop();
    finishCancellation();
    await Promise.all([running, stopping]);

    expect(setTyping.mock.calls.map(([input]) => input.typing)).toEqual([
      true,
      false,
    ]);
  });

  it("waits for the previous cancellation before starting new activity", async () => {
    let finishFirstWork!: () => void;
    let finishSecondWork!: () => void;
    const firstWork = new Promise<void>((resolve) => {
      finishFirstWork = resolve;
    });
    const secondWork = new Promise<void>((resolve) => {
      finishSecondWork = resolve;
    });
    let finishFirstCancellation!: () => void;
    const firstCancellation = new Promise<void>((resolve) => {
      finishFirstCancellation = resolve;
    });
    let cancellationCount = 0;
    const setTyping = vi.fn<WeixinClient["setTyping"]>(async (input) => {
      if (!input.typing && cancellationCount++ === 0) {
        await firstCancellation;
      }
    });
    const indicator = new WeixinTypingIndicator({ setTyping });
    const target = { session, toUserId: "owner", contextToken: "ctx" };
    const first = indicator.during(target, () => firstWork);
    await vi.waitFor(() => expect(setTyping).toHaveBeenCalledTimes(1));

    finishFirstWork();
    await vi.waitFor(() => expect(setTyping).toHaveBeenCalledTimes(2));
    const second = indicator.during(target, () => secondWork);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(setTyping).toHaveBeenCalledTimes(2);

    finishFirstCancellation();
    await first;
    await vi.waitFor(() => expect(setTyping).toHaveBeenCalledTimes(3));
    expect(setTyping.mock.calls.map(([input]) => input.typing)).toEqual([
      true,
      false,
      true,
    ]);

    finishSecondWork();
    await second;
  });

  it("does not let an unresponsive cancellation block shutdown", async () => {
    vi.useFakeTimers();
    const never = new Promise<void>(() => undefined);
    const setTyping = vi.fn<WeixinClient["setTyping"]>(async (input) => {
      if (!input.typing) await never;
    });
    const indicator = new WeixinTypingIndicator({ setTyping });
    let finishWork!: () => void;
    const work = new Promise<void>((resolve) => {
      finishWork = resolve;
    });
    const running = indicator.during(
      { session, toUserId: "owner", contextToken: "ctx" },
      () => work,
    );
    await vi.advanceTimersByTimeAsync(0);

    let stopped = false;
    const stopping = indicator.stop().then(() => {
      stopped = true;
    });
    let alsoStopped = false;
    const alsoStopping = indicator.stop().then(() => {
      alsoStopped = true;
    });
    await vi.advanceTimersByTimeAsync(2_999);
    expect(stopped).toBe(false);
    expect(alsoStopped).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await Promise.all([stopping, alsoStopping]);
    expect(stopped).toBe(true);
    expect(alsoStopped).toBe(true);

    finishWork();
    await running;
  });

  it("aborts a slow typing start when work finishes before it", async () => {
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const sentStatuses: boolean[] = [];
    const setTyping = vi.fn<WeixinClient["setTyping"]>(async (input) => {
      if (input.typing && input.signal) {
        await new Promise<void>((_resolve, reject) => {
          if (input.signal?.aborted) {
            reject(input.signal.reason);
            return;
          }
          input.signal?.addEventListener(
            "abort",
            () => reject(input.signal?.reason),
            { once: true },
          );
        });
      }
      sentStatuses.push(input.typing);
    });
    const indicator = new WeixinTypingIndicator({ setTyping });

    await expect(
      indicator.during(
        { session, toUserId: "owner", contextToken: "ctx" },
        async () => "fast answer",
      ),
    ).resolves.toBe("fast answer");

    expect(sentStatuses).toEqual([false]);
    expect(stderr).not.toHaveBeenCalled();
  });

  it("reuses an acquired ticket when cancelling an aborted typing start", async () => {
    const requests: Array<{
      path: string;
      status?: number;
      ticket?: string;
    }> = [];
    let typingStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      typingStarted = resolve;
    });
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      const body = JSON.parse(String(init?.body));
      requests.push({
        path,
        status: body.status,
        ticket: body.typing_ticket,
      });
      if (path.endsWith("/getconfig")) {
        return new Response(
          JSON.stringify({ ret: 0, typing_ticket: "shared-ticket" }),
          { status: 200 },
        );
      }
      if (body.status === 1) {
        typingStarted();
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (signal?.aborted) {
            reject(signal.reason);
            return;
          }
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      }
      return new Response(JSON.stringify({ ret: 0 }), { status: 200 });
    });
    const client = new WeixinClient(defaultConfig().weixin, fetchMock);
    const indicator = new WeixinTypingIndicator(client);
    let finishWork!: () => void;
    const work = new Promise<void>((resolve) => {
      finishWork = resolve;
    });

    const running = indicator.during(
      { session, toUserId: "owner", contextToken: "ctx" },
      () => work,
    );
    await started;
    finishWork();
    await running;

    expect(requests).toEqual([
      { path: "/ilink/bot/getconfig", status: undefined, ticket: undefined },
      {
        path: "/ilink/bot/sendtyping",
        status: 1,
        ticket: "shared-ticket",
      },
      {
        path: "/ilink/bot/sendtyping",
        status: 2,
        ticket: "shared-ticket",
      },
    ]);
  });

  it("redacts remote typing failures before writing them to stderr", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith("/getconfig")) {
        return new Response(
          JSON.stringify({ ret: 0, typing_ticket: "typing-ticket" }),
          { status: 200 },
        );
      }
      const body = JSON.parse(String(init?.body));
      if (body.status === 1) {
        return new Response(
          JSON.stringify({
            ret: -7,
            errcode: -14,
            errmsg: "LEAK_MARKER\nAuthorization: Bearer fake-secret",
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ret: 0 }), { status: 200 });
    });
    let resolveLogged!: () => void;
    const logged = new Promise<void>((resolve) => {
      resolveLogged = resolve;
    });
    let stderrOutput = "";
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((chunk) => {
        stderrOutput += String(chunk);
        resolveLogged();
        return true;
      });
    const client = new WeixinClient(defaultConfig().weixin, fetchMock);
    const indicator = new WeixinTypingIndicator(client);

    const result = await indicator.during(
      { session, toUserId: "owner", contextToken: "ctx" },
      async () => {
        await logged;
        return "task result";
      },
    );

    expect(result).toBe("task result");
    expect(stderr).toHaveBeenCalledTimes(1);
    expect(stderrOutput).toBe("微信输入状态更新失败（错误码 -7）\n");
    expect(stderrOutput).not.toContain("LEAK_MARKER");
    expect(stderrOutput).not.toContain("fake-secret");
  });

  it("logs no misleading code when the failure is not a protocol rejection", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith("/getconfig")) {
        return new Response(
          JSON.stringify({ ret: 0, typing_ticket: "typing-ticket" }),
          { status: 200 },
        );
      }
      const body = JSON.parse(String(init?.body));
      if (body.status === 1) {
        // HTTP 200 但响应体不是 JSON：不是协议拒绝，不得打出「错误码 200」。
        return new Response("<html>gateway glitch</html>", { status: 200 });
      }
      return new Response(JSON.stringify({ ret: 0 }), { status: 200 });
    });
    let resolveLogged!: () => void;
    const logged = new Promise<void>((resolve) => {
      resolveLogged = resolve;
    });
    let stderrOutput = "";
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((chunk) => {
        stderrOutput += String(chunk);
        resolveLogged();
        return true;
      });
    const client = new WeixinClient(defaultConfig().weixin, fetchMock);
    const indicator = new WeixinTypingIndicator(client);

    const result = await indicator.during(
      { session, toUserId: "owner", contextToken: "ctx" },
      async () => {
        await logged;
        return "task result";
      },
    );

    expect(result).toBe("task result");
    expect(stderr).toHaveBeenCalledTimes(1);
    expect(stderrOutput).toBe("微信输入状态更新失败\n");
    expect(stderrOutput).not.toContain("错误码 200");
  });
});
