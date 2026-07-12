---
name: wechat-codelink
description: Use CodeLink when the user asks Codex to notify them on WeChat, bind the current Codex conversation for later continuation from WeChat, check the bridge or current binding, or inspect recent WeChat conversation activity.
---

# CodeLink WeChat

CodeLink exposes tools from the `codelink` MCP server. Use the smallest tool that satisfies the request.

If the CodeLink skill is visible but its MCP tools are not, do not describe the installation as broken based only on the current task. Explain that plugin tools are loaded at task creation, ask the user to create a new Codex task, and recommend restarting Codex App if a new task still lacks the tools. The safe local fallback is the runtime CLI's `doctor` command; it distinguishes plugin/runtime readiness from daemon and WeChat readiness without exposing identifiers. Resolve its state directory from `CODELINK_STATE_DIR` when set, otherwise from the current user's home plus `.codelink`. Do not present POSIX `~` syntax as a cross-platform path. On a POSIX shell, use `STATE_DIR="${CODELINK_STATE_DIR:-$HOME/.codelink}"; node "$STATE_DIR/runtime/cli.cjs" doctor`. On PowerShell, use `$StateDir = if ($env:CODELINK_STATE_DIR) { $env:CODELINK_STATE_DIR } else { Join-Path $HOME ".codelink" }; node (Join-Path $StateDir "runtime\cli.cjs") doctor`. Never bypass a missing MCP tool by calling the daemon HTTP API directly for a write action.

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

- New conversations created from WeChat use separate thread ids but share the configured CodeLink workspace instead of per-conversation directories. The default workspace is the `Documents/Codex/CodeLink` path under the current user's home, joined with the platform's native path API rather than a hard-coded separator. This provides a stable cwd for Codex project grouping, but CodeLink does not control remote UI refresh or historical project presentation. A bound desktop conversation keeps its existing Codex context and project.
- Do not claim that a WeChat-created conversation will appear in the live Codex App sidebar.
- Do not treat conversation continuation as human-in-the-loop approval. CodeLink does not approve tool calls or permission requests through WeChat.
- Never reveal or request the stored bot token through a tool response.
