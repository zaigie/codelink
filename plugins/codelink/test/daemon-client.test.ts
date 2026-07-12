import { describe, expect, it, vi } from "vitest";

import { DaemonClient } from "../src/daemon-client.js";

describe("DaemonClient", () => {
  it("sends an explicit notification payload to the local daemon", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, toUserId: "owner" }), {
          status: 200,
        }),
      );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:18791",
      fetchImpl: fetchMock,
    });

    const result = await client.send({
      text: "task completed",
      threadId: "019f55b8-d06b-7213-98de-2815f865c43d",
    });

    expect(result).toEqual({ ok: true, toUserId: "owner" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://127.0.0.1:18791/send");
    expect(JSON.parse(String(init?.body))).toEqual({
      text: "task completed",
      threadId: "019f55b8-d06b-7213-98de-2815f865c43d",
    });
  });
});
