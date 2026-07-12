---
name: wechat-codelink
description: Use CodeLink when the user asks Codex to notify them on WeChat, bind the current Codex conversation for later continuation from WeChat, check the bridge or current binding, or inspect recent WeChat conversation activity.
---

# CodeLink WeChat

CodeLink exposes tools from the `codelink` MCP server. Use the smallest tool that satisfies the request.

If the CodeLink skill is visible but its MCP tools are not, do not describe the installation as broken based only on the current task. Explain that plugin tools are loaded at task creation, ask the user to create a new Codex task, and recommend restarting Codex App if a new task still lacks the tools. The safe local fallback is `node ~/.codelink/runtime/cli.cjs doctor`; it distinguishes plugin/runtime readiness from daemon and WeChat readiness without exposing identifiers. Never bypass a missing MCP tool by calling the daemon HTTP API directly for a write action.

## Send and bind

- Use `send_wechat_message` only when the user explicitly asks to send, notify, report, summarize, or continue through WeChat.
- Let CodeLink read the calling Codex thread from trusted tool metadata. Never ask the user for a thread ID and never invent one.
- A successful call normally makes the calling Codex conversation the recipient's current WeChat conversation. The latest notifying conversation replaces the earlier binding.
- Check `conversationBound` in the result. If it is false, state that the notification was sent but the current conversation was not changed.
- Treat the tool call as an external message. Preserve the user's intended meaning and do not add secrets, local paths, raw logs, tokens, hidden reasoning, or unrelated context.
- Prefer a short outcome-first update. For completion notifications, include the result, important verification status, and any remaining blocker.
- Omit `userId` to use the owner who completed QR login. Provide it only when the user explicitly identifies another already-authorized recipient.
- If the daemon is offline or no usable context token exists, report the returned error and do not claim delivery.
- Do not write the CodeLink notification label or reply instructions yourself. The daemon appends the canonical footer.

## Conversation behavior

- Treat ordinary WeChat messages as follow-ups to the current bound Codex conversation.
- Start a new conversation when the user sends `/new`, `/new <request>`, or clearly says phrases such as “开个新会话” or “换个话题”. Do not require `/new` when the intent is explicit.
- After a desktop task sends a bound notification, tell the user they can reply in WeChat to continue it.

## Read-only checks

- Use `get_wechat_status` to verify whether the daemon, session, default recipient, and current conversation are ready.
- Use `list_recent_wechat_tasks` when the user asks about recent WeChat conversation turns.

## Boundaries

- Only a new conversation created from WeChat gets a generated workspace. A bound desktop conversation keeps its existing Codex context.
- Do not claim that a WeChat-created conversation will appear in the live Codex App sidebar.
- Do not treat conversation continuation as human-in-the-loop approval. CodeLink does not approve tool calls or permission requests through WeChat.
- Never reveal or request the stored bot token through a tool response.
