# Architecture decisions

## Why a daemon and an MCP server are separate

Codex starts plugin MCP servers in the context of a task. An MCP server therefore cannot receive a WeChat message while no Codex task is alive. CodeLink uses a persistent per-user daemon for iLink long polling and a small stdio MCP server for task-local tool calls.

The MCP server communicates only with `http://127.0.0.1:18791`. No bot token is passed through MCP.

## Task creation semantics

Each accepted incoming text message starts an official `codex app-server` subprocess, calls `thread/start` and `turn/start`, and creates a new Codex App-visible task with its own generated workspace under `~/Documents/Codex/CodeLink/<date>/<task-id>`.

This deliberately avoids attaching incoming work to the CodeLink repository or any other existing project. App Server persists the thread with the desktop-compatible source classification in the normal Codex session store, so it appears alongside other Codex App tasks. The JavaScript Codex SDK is intentionally not used here because its automation threads are persisted with the `exec` source and are filtered out of the App task list.

## Reply context

Tencent iLink replies require the `context_token` from an inbound message. CodeLink stores the most recent token per authorized user. Proactive MCP notifications use that token and fail closed when none is available.

## Future HITL

HITL should be implemented as a separate capability, not by widening the current daemon's sandbox. A future version can persist approval requests, send a bounded prompt to the owner, verify an idempotent signed response, and deliver that response to the exact active Codex turn through App Server steering/approval APIs.
