# Daemon runtime safety technical design

## Context

[PRODUCT.md](./PRODUCT.md) defines seven runtime invariants.

At integration base `470f4e3`, `plugins/codelink/src/daemon.ts` durably accepts ordinary tasks, uses native temporary typing instead of permanent acknowledgements, skips legacy pending acknowledgements during recovery, and sends plain result bodies with a single notice only for explicit new-conversation requests. Operational commands still have no durable replay record, desktop notifications have no recipient-scoped transaction, `StateStore` cannot restore an exact conversation snapshot, delivery is serialized globally, `DaemonClient` uses one unauthenticated 10-second request path, and `setup.mjs` probes `/health` directly.

The implementation must retain the integration base's accepted-task recovery, durable result outbox, stable chunk delivery keys, conversation generations, native inbound typing, no-permanent-acknowledgement behavior, plain reply bodies, explicit-new single notice, and macOS/Linux/Windows installation routes.

## Proposed changes

### Inbound acceptance and privacy

- Add a bounded private processed-message ledger to `StateStore`, written atomically with the existing private JSON writer and exposed in `codelink state` as a path only.
- Resolve a stable identity before dispatching authorized text. Namespace every identity by WeChat account and identity source (`message_id`, `seq`, or derived payload digest), so equal numeric values from different sources or accounts do not collide. When upgrading, also look for the raw ID format used by existing `f9b24d8` `TaskRecord` entries and mark the new identity processed instead of replaying that accepted task.
- Check the processed ledger before every command or task. Persist ordinary-task acceptance synchronously before `pollOnce` may save the next cursor; `TaskRecord` acceptance remains the task execution source of truth. Operational commands (`/status`, `/help`, prompt-less `/new`) mark the ledger only after their reply delivery settles, with an in-memory in-flight set deduplicating copies inside one batch, so a crash while a reply is in flight replays the idempotent command instead of dropping the reply.
- Start native typing and task execution only after the task record and replay ledger are durable. Typing setup, keepalive, cancellation, or failure remains background feedback and cannot delay cursor advancement.
- Keep allowlist evaluation before context or replay persistence and replace the rejection log with a generic event.

### Notification transactions

- Add a promise-tail queue in `CodelinkDaemon` keyed by the recipient resolved from a session snapshot captured at enqueue time. Before reading context, binding, or sending, compare the current account, token, default user, and base URL with that snapshot and reject the operation if login state changed. The queue then encloses allowlist/context reads, conversation binding, delivery, and rollback.
- Keep desktop-originated notifications on the delivery path only; they never enter the inbound-request typing lifecycle.
- Add a `StateStore` conditional snapshot restore operation. It compares both the current binding and generation with the notification snapshot, then restores both the prior binding and prior generation exactly.
- Replace the process-wide delivery tail with recipient-keyed tails in `WeixinTextDelivery`, preserving same-recipient ordering while allowing different recipients to progress concurrently.

### Local HTTP security and readiness

- Add an installation credential to `StateStore`. Generate 32 random bytes, fully write a mode-`0600` temporary file, and publish it with an exclusive same-directory hard link so concurrent first users observe one complete token. Keep the state directory private and remove temporary files on every outcome.
- Reject non-loopback daemon hosts before listening. Authenticate every request before routing with a strict bearer parser and constant-time comparison. Test-only constructor/client options may inject a credential without changing production defaults.
- Keep the existing poll timestamps and degraded/session-expired state as the readiness source. Serve the identifier-free `GET /healthz` probe (service name and readiness booleans only) before authentication so installers can classify port ownership; after authentication, return health status from that source and reject every non-health route with `503` until it is ready.
- Make `DaemonClient` load the installation credential automatically and attach it to every request. Prepare credential and headers before creating the abort timer. Use 10-second read and 10-minute send constants.
- Make the CLI `status` command print degraded details but exit non-zero when `ok` is false. The cross-platform installer keeps probing the identifier-free `/healthz` endpoint, which also classifies foreign port owners (`E_PORT_OCCUPIED`); the credential never appears in argv.

### Documentation

- Reconcile README, installation guidance, capability boundary, and architecture claims with enforced loopback, bearer authentication, readiness, replay, notification ordering, and timeout behavior.
- Keep these specs aligned with the final code and tests in the same branch.

## Testing and validation

1. **Behavior §1** → daemon regression covering replay of `/status`, `/help`, `/new`, natural-language new-conversation, and ordinary messages; account/source identity isolation; legacy raw-task lookup; commands staying replayable (ledger unwritten) while replies are pending at cursor save, redelivery after a mid-delivery crash, single reply for in-batch duplicates; and a slow typing request plus long task that cannot block cursor advancement or the next poll.
2. **Behavior §2** → unauthorized-message regression that snapshots the state directory and stderr, includes a raw user ID and context token, and proves neither appears in state changes or logs.
3. **Behavior §3** → notification concurrency regression covering fail→success, success→fail, all-fail, exact full-snapshot equality, a generation-only stale CAS, queued login replacement before any context/binding/send work, simultaneous different-recipient delivery, and proof that desktop notification sends do not call `setTyping`.
4. **Behavior §4** → real HTTP integration test for rejected wildcard/LAN hosts, missing/wrong bearer on every route, authenticated success, token non-disclosure, and a multi-process first-credential race that yields one private token.
5. **Behavior §5** → real polling/HTTP integration test for initial `503`, first-poll `200`, auth-error `503`, recovery `200`, non-ready business-route `503`, and unauthenticated `/healthz` serving identifier-free readiness for the installer probe.
6. **Behavior §6** → fake-timer client regression proving status/tasks abort at 10 seconds and send remains live until 10 minutes.
7. **Behavior §7** → fake-timer client regression where credential preparation throws, proving fetch is not called and the timer count remains zero.

Run `npm run typecheck`, `npm test`, `npm run build`, `sh -n scripts/*.sh`, and PowerShell parser coverage where available. For each Behavior item, apply one meaningful implementation mutation and require its mapped regression to fail before restoring the implementation.

## Risks and mitigations

- Exact rollback deliberately restores a prior conversation generation after a failed notification. The conditional comparison prevents overwriting any state changed by another operation during the send.
- Recipient-scoped delivery increases concurrency relative to the existing global tail. Same-recipient ordering remains strict, and existing per-chunk retry/delay behavior is unchanged.
- POSIX mode bits are not portable to Windows. The token remains inside the user's private state directory; POSIX tests assert `0600`, while Windows continues to rely on the user-profile ACL used by existing state files.
