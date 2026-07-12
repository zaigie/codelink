import { describe, expect, it } from "vitest";

import { parseNewConversationIntent } from "../src/conversation-intent.js";

describe("parseNewConversationIntent", () => {
  it("recognizes /new with or without an initial prompt", () => {
    expect(parseNewConversationIntent("/new")).toEqual({
      startNew: true,
      prompt: "",
    });
    expect(parseNewConversationIntent("/new 帮我分析这个错误")).toEqual({
      startNew: true,
      prompt: "帮我分析这个错误",
    });
  });

  it("recognizes explicit natural-language switching without matching ordinary requests", () => {
    expect(parseNewConversationIntent("开个新会话")).toEqual({
      startNew: true,
      prompt: "",
    });
    expect(
      parseNewConversationIntent("重新开一个会话，帮我看另一个项目"),
    ).toEqual({
      startNew: true,
      prompt: "帮我看另一个项目",
    });
    expect(parseNewConversationIntent("换个话题：解释这个报错")).toEqual({
      startNew: true,
      prompt: "解释这个报错",
    });
    expect(
      parseNewConversationIntent("我想重新开始一个对话：讨论发布计划"),
    ).toEqual({
      startNew: true,
      prompt: "讨论发布计划",
    });
    expect(parseNewConversationIntent("帮我写一份如何新建会话的说明")).toEqual(
      {
        startNew: false,
        prompt: "帮我写一份如何新建会话的说明",
      },
    );
    expect(parseNewConversationIntent("完成后通知我")).toEqual({
      startNew: false,
      prompt: "完成后通知我",
    });
  });
});
