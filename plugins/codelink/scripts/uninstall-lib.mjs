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

export function uninstallLifecycle({ runServicePhase, runCodex, onSkip }) {
  requireSuccess("停止 CodeLink 后台服务", runServicePhase("stop"));
  if (runCodex) {
    requireSuccess("移除 CodeLink 插件", runCodex(PLUGIN_REMOVE_ARGS));
    requireSuccess(
      "移除 CodeLink marketplace",
      runCodex(MARKETPLACE_REMOVE_ARGS),
      isMarketplaceAbsent,
    );
  } else {
    onSkip?.("移除 CodeLink 插件与 marketplace");
  }
  requireSuccess("清理 CodeLink 服务配置和 runtime", runServicePhase("cleanup"));
}

// 以稳定错误标志识别 absent（实测 codex 0.142.0 在 --json 下仍把该纯文本写到
// stderr、stdout 为空）；按包含匹配容忍版本间措辞的轻微变化，其余错误 fail-closed。
function isMarketplaceAbsent(result) {
  return (
    result?.status !== 0 &&
    String(result.stdout ?? "").trim() === "" &&
    String(result.stderr ?? "").includes(
      "marketplace `codelink-local` is not configured or installed",
    )
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
