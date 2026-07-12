# Architecture decisions

## Why a daemon and an MCP server are separate

Codex starts plugin MCP servers in the context of a task. An MCP server therefore cannot receive a WeChat message while no Codex task is alive. CodeLink uses a persistent per-user daemon for iLink long polling and a small stdio MCP server for task-local tool calls.

The MCP server communicates only with `http://127.0.0.1:18791`. No bot token is passed through MCP.

## Task creation semantics

Each accepted incoming text message starts an official `codex app-server` subprocess, calls `thread/start` and `turn/start`, and creates a new independent Codex session with its own generated workspace under `~/Documents/Codex/CodeLink/<date>/<task-id>`.

The incoming WeChat text is the only user message. CodeLink safety rules are passed through `developerInstructions`, so they do not pollute the user request.

This deliberately avoids attaching incoming work to the CodeLink repository or any other existing project. App Server persists the thread in the normal Codex session store and returns its thread ID. A separately launched App Server cannot publish its live `thread/started` event to the already-running desktop App connection, so sidebar visibility is not part of the contract.

## Standalone WeChat login

The default login path directly calls Tencent iLink's QR endpoints with an empty `local_token_list` when no CodeLink session exists. It neither imports nor reads OpenClaw state. After confirmation, only CodeLink-owned files under `~/.codelink` are written.

OpenClaw import/export remains an optional migration utility for users who explicitly need to preserve an existing Bot identity. It is not part of installation or first login.

## Reply context

Tencent iLink replies require the `context_token` from an inbound message. CodeLink stores the most recent token per authorized user. Proactive MCP notifications use that token and fail closed when none is available.

## Future HITL

HITL should be implemented as a separate capability, not by widening the current daemon's sandbox. A future version can persist approval requests, send a bounded prompt to the owner, verify an idempotent signed response, and deliver that response to the exact active Codex turn through App Server steering/approval APIs.
