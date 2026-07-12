# Installer clean lifecycle

## Summary

CodeLink 的跨平台安装与卸载必须可重复执行：全新安装能从锁文件复现依赖，后台服务始终使用确定的 Codex 可执行文件，卸载则完整清理 CodeLink 安装物但保留用户状态。失败时不得伪装成功或继续破坏诊断现场。

## Goals

- 保证 macOS、Linux、Windows 当前支持范围内的安装与卸载行为一致。
- 保留微信登录、任务绑定、日志和用户选择的源码目录；只清理 CodeLink 安装产生的插件、marketplace、服务配置和复制 runtime。

## Non-goals

- 不删除整个 CodeLink 状态目录或持久源码。
- 不增加新的系统级服务模式，也不扩展现有操作系统和架构范围。

## Behavior

1. 在 Node.js 22 下，全新 checkout 使用 npm 10 或 npm 11 执行 clean `npm ci` 都必须仅依赖已提交的 manifest 与 lockfile 成功完成。
2. 无论 Codex 来自标准 PATH/npm wrapper 还是 `CODELINK_CODEX_BIN` override，安装器写入后台服务的都必须是存在、可执行的绝对原生二进制路径；无法满足时必须在修改插件或服务前失败。
3. macOS、Linux、Windows 的卸载顺序必须是：停止对应用户态服务，移除 `codelink@codelink-local` 插件，移除 `codelink-local` marketplace，最后删除服务配置和复制的 runtime；除 runtime 外的 CodeLink 状态始终保留。
4. 已完成卸载后再次运行卸载仍须成功；幂等处理只接受可精确识别的“服务、插件或 marketplace 已不存在”状态，其他错误不能被忽略。
5. 卸载任一步出现真实失败时必须返回失败并停止后续步骤；尤其在服务停止、插件移除或 marketplace 移除失败时，服务配置和 runtime 必须留在原处供诊断，用户状态不得删除。
6. 含空格及合法特殊字符的 Node、Codex、runtime、日志或状态路径必须在对应平台的服务配置中保持原值；macOS plist 必须是合法 XML，现有 Linux systemd 与 Windows PowerShell 转义行为不得退化。
