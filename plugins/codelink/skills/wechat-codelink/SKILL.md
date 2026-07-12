---
name: wechat-codelink
description: Use CodeLink when the user asks Codex to notify them on WeChat, send a task summary or progress update to WeChat, check the WeChat bridge, or inspect tasks received from WeChat.
---

# CodeLink WeChat

CodeLink exposes tools from the `codelink` MCP server. Use the smallest tool that satisfies the request.

## Sending messages

- Use `send_wechat_message` only when the user explicitly asks to send, notify, report, or summarize through WeChat.
- Treat the tool call as an external message. Preserve the user's intended meaning and do not add secrets, local paths, raw logs, tokens, hidden reasoning, or unrelated context.
- Prefer a short outcome-first update. For completion notifications, include the result, important verification status, and any remaining blocker.
- Omit `userId` to use the owner who completed QR login. Provide it only when the user explicitly identifies another already-authorized recipient.
- If the daemon is offline or no usable context token exists, report the returned error and do not claim delivery.

## Read-only checks

- Use `get_wechat_status` to verify whether the daemon, session, and default recipient are ready.
- Use `list_recent_wechat_tasks` when the user asks about tasks created from incoming WeChat messages.

## Boundaries

- Incoming WeChat messages create independent Codex threads in generated task workspaces; they are not attached to the current repository.
- Do not use CodeLink to add human-in-the-loop approval behavior. The current version only creates tasks and sends notifications.
- Never reveal or request the stored bot token through a tool response.
