const CODEX_THREAD_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isCodexThreadId(value: unknown): value is string {
  return typeof value === "string" && CODEX_THREAD_ID_PATTERN.test(value);
}
