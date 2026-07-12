export const MARKETPLACE_ABSENT_ERROR =
  "Error: marketplace `codelink-local` is not configured or installed";

const PLUGIN_REMOVE_ARGS = [
  "plugin",
  "remove",
  "codelink@codelink-local",
  "--json",
];
const MARKETPLACE_REMOVE_ARGS = [
  "plugin",
  "marketplace",
  "remove",
  "codelink-local",
  "--json",
];

export function uninstallLifecycle({ runServicePhase, runCodex }) {
  requireSuccess("停止 CodeLink 后台服务", runServicePhase("stop"));
  requireSuccess("移除 CodeLink 插件", runCodex(PLUGIN_REMOVE_ARGS));
  requireSuccess(
    "移除 CodeLink marketplace",
    runCodex(MARKETPLACE_REMOVE_ARGS),
    isExactMarketplaceAbsent,
  );
  requireSuccess("清理 CodeLink 服务配置和 runtime", runServicePhase("cleanup"));
}

function isExactMarketplaceAbsent(result) {
  return (
    result?.status !== 0 &&
    String(result.stdout ?? "").trim() === "" &&
    String(result.stderr ?? "").trim() === MARKETPLACE_ABSENT_ERROR
  );
}

function requireSuccess(step, result, allowFailure = () => false) {
  if (result?.status === 0 || allowFailure(result)) return;

  if (result?.error) {
    throw new Error(`${step}失败：${result.error.message}`, {
      cause: result.error,
    });
  }

  const output = [result?.stderr, result?.stdout]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join("\n");
  const exitCode = result?.status ?? "unknown";
  throw new Error(
    `${step}失败（退出码 ${exitCode}）${output ? `：${output}` : ""}`,
  );
}
