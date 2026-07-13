# Installer clean lifecycle technical design

## Context

[PRODUCT.md](./PRODUCT.md) 定义安装可复现性和完整卸载契约。当前统一安装入口在 `plugins/codelink/scripts/setup.mjs:70-162`，可执行文件解析与平台路由在 `plugins/codelink/scripts/setup-lib.mjs:37-285`。三个安装适配器会复制 runtime 并持久化 Node/Codex 路径，但 `plugins/codelink/scripts/uninstall-launch-agent.sh:1-9`、`uninstall-systemd-user.sh:1-14` 和 `uninstall-scheduled-task.ps1:1-20` 只移除服务/runtime，且 Unix 脚本会吞掉非 absent 错误。现有 `plugins/codelink/test/setup-platform.test.mjs` 只覆盖平台选择、部分路径解析、LaunchAgent 字符串转义和语法。

## Proposed changes

1. 用当前 manifest 重新生成最小 lockfile 元数据，补齐 npm 10/11 校验要求的可选 peer 节点；该变更独立提交，不混入生命周期代码。
2. 收紧 `setup-lib.mjs` 的 Codex 解析：标准发现和 override 最终都规范化为当前平台的绝对路径，并在返回前检查文件可执行。继续复用官方 npm wrapper 到原生二进制的既有推导，不增加配置项。
3. 新增一个 Node 卸载编排模块，唯一负责固定顺序、Codex 命令执行、按稳定标志的 absent 分类、错误上下文和 fail-closed；Codex 不可用时跳过插件/marketplace 步骤并回调提示。编排器同步串行执行，避免并发卸载产生顺序竞争；它不记录 token、session 或命令环境。
4. 现有三平台卸载脚本保留为用户入口和薄服务适配器，仅实现 `stop` 与 `cleanup` 两阶段。Node 编排器在两阶段之间移除插件与 marketplace；Windows 继续使用 PowerShell cmdlet，macOS/Linux 继续使用原生用户态服务工具。
5. 服务不存在通过结构化查询或稳定错误标志识别（launchctl 按「No such process」标志、marketplace 按 ``marketplace `codelink-local` is not configured or installed`` 标志做包含匹配）。实测 codex 0.142.0：`plugin remove` 对不存在的插件 exit 0 且输出 JSON；`plugin marketplace remove --json` 对不存在的 marketplace 以纯文本 stderr 报错、stdout 为空。其他非零退出均传播。
6. 更新 `INSTALL.md`，把卸载说明从“仅服务”改为完整生命周期，并明确状态保留与失败语义。规格随实际实现同步。

已完成的外部操作不做推测性回滚：例如插件成功移除后 marketplace 失败，插件保持已移除，但服务配置/runtime 留存并返回错误。重试依靠 Behavior §4 的幂等契约继续完成。此次不涉及 SQL、事务、中间件、并发共享状态或国际化资源；控制台文案沿用现有中文风格。

## Testing and validation

1. **Behavior §1** → 在两个全新 detached worktree 中使用 Node 22 分别运行 npm 10 与 npm 11 `ci`；两者必须成功且不修改 tracked 文件。lockfile commit 前保留确定性失败证据，commit 后复跑成功。
2. **Behavior §2** → `test/setup-platform.test.mjs` 覆盖标准 PATH、npm wrapper、相对/绝对 override 的绝对化，拒绝不存在或不可执行文件；完整服务配置回环验证持久化值不变。
3. **Behavior §3** → 平台路由测试覆盖 macOS、Linux、Windows 三个适配器；共享编排测试精确断言 `stop → plugin remove → marketplace remove → cleanup`，macOS 端到端 fixture 检查 cleanup 只删除服务配置/runtime、保留 session/state。
4. **Behavior §4** → 模拟第一次存在、第二次 absent 的连续卸载；断言两次成功。分别把近似但不完全相同的服务/marketplace 错误注入，断言不得误判为 absent。
5. **Behavior §5** → 在 stop、plugin remove、marketplace remove、cleanup 四个边界逐项注入真实失败；断言错误包含步骤上下文，后续调用不发生，前三个边界下服务配置/runtime/session 均保留。
6. **Behavior §6** → 扩展 LaunchAgent 特殊字符测试并用可用时的 `plutil -lint` 校验完整模板；执行 Linux fixture 检查 systemd unit 路径回环；PowerShell 可用时解析并执行 renderer fixture，否则至少执行 parser gate。

全量门禁：`npm test`、`npm run typecheck`、`npm run build`、所有 Unix 脚本 `sh -n`、PowerShell parser（若可用）、完整 plist `plutil -lint`、`git diff --check`。行为 mutation 至少覆盖：交换插件/marketplace 顺序、放宽 absent 匹配、提前 cleanup、去掉绝对路径规范化；对应测试必须失败。

提交保持原子：第一提交只含 lockfile；第二提交包含规格、实现、测试和文档。失败时可分别 revert；不自动 push 或创建 PR。
