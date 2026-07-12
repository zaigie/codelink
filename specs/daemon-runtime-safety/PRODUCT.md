# Daemon runtime safety

## Summary

CodeLink's local daemon must accept WeChat updates, desktop notifications, and local API requests without replaying user-visible effects, exposing an unauthenticated control surface, or reporting readiness before WeChat polling actually works.

## Problem

The current runtime durably accepts ordinary tasks before advancing the WeChat cursor, but operational commands, concurrent desktop notifications, and the local HTTP boundary do not yet provide the same safety guarantees. These gaps can duplicate commands, leave the wrong conversation selected after failures, expose local actions without authentication, or time out valid multi-part sends too early.

## Behavior

1. For an authorized WeChat message, replaying the same stable message identity does not repeat the user-visible or task side effects of `/status`, `/help`, `/new`, a natural-language new-conversation command, or an ordinary task. CodeLink advances a returned update cursor only after every message in that batch has either been durably accepted or safely ignored; long-running accepted tasks and slow native typing feedback continue in the background and do not block later polls.
2. A message from a user outside the allowlist creates no saved context, conversation, task, or replay state. Its rejection log is generic and contains neither the raw user identity nor any credential or context token.
3. Desktop notification operations for the same WeChat user run as complete ordered transactions: each reads state, binds, sends, and either commits or restores the exact prior conversation state before the next begins. Each operation uses the WeChat session captured when it enters the queue and fails before reading context, binding, or sending if that session changes while queued. If all sends fail, the original state is unchanged; if some succeed, the last successful binding remains. Notifications for different users can send concurrently, and desktop-originated notifications do not start inbound typing feedback.
4. The local daemon accepts only literal loopback listen addresses. Every HTTP route requires the installation's private bearer credential; a missing or incorrect credential receives `401`, and responses and logs never disclose the credential. Concurrent first use creates one shared private credential with owner-only permissions where the platform supports POSIX modes.
5. Listening on a socket is not readiness. The daemon starts non-ready, becomes ready only after a successful WeChat poll, becomes non-ready on polling or WeChat authentication errors, and recovers after a later successful poll. Authenticated business routes return `503` while non-ready. Installation checks readiness through the authenticated CLI without putting the credential in process arguments.
6. Status and recent-task reads time out after 10 seconds. Notification sends remain active beyond 10 seconds and time out after 10 minutes so valid sequential multi-part delivery is not cut off.
7. If preparing the local daemon credential or request headers fails, the request fails immediately without invoking HTTP and without leaving a pending timeout that keeps the CLI or MCP process alive.

## Non-goals

- The daemon is not made remotely accessible and does not gain a public authentication mode.
- This change does not promise exactly-once execution across arbitrary upstream identity collisions; it relies on the stable identity supplied or derived for each received message.
- Existing accepted-task recovery and durable task-result delivery remain in place; this work does not replace them with a new job system.
