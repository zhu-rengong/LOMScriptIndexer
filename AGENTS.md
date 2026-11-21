# 工程约束

本文件是本仓库唯一的规则真源；`.codebuddy/rules/scriptindexer.mdc` 只指回这里。本机专属的绝对路径不写进入库文件，统一手填到被 git 忽略的 `AGENTS.local.md`（模板见 `AGENTS.local.example.md`）；该文件缺失时先向用户询问路径，不凭记忆猜测。

## 代码

- Python 3.14+ 写法，uv + `pyproject.toml` 管理依赖与入口，不写 `from __future__ import annotations`。
- Vue 3.5 SFC + TypeScript + Vite 8，pnpm 管理；源码 `web/`，产物 `docs/`。
- 状态归 Pinia，API 与组件自动导入。
- 不写任何注释与 docstring，改动触及的旧注释一并删除；不写 README 与文档。
- 不保留旧代码、兼容层与迁移逻辑，破坏性变更直接替换。
- 路径只用 `pathlib` 或 `os.environ`，不硬编码盘符与反斜杠。
- 图标用内联 SVG，不用 emoji；分组与分隔靠布局和样式，纯文本用标点或空格，不堆装饰性符号。
- 代码与文档一律使用英文，包含但不限于日志、报错、脚本输出。

## 质量

- 前端在 `web/` 下执行 `pnpm lint`（ESLint）、`pnpm format:check`（Prettier）、`pnpm build`，全部通过为准。
- 后端执行 `uv run ruff check`、`uv run pyright`，全部通过为准。
- 不建测试文件、不跑测试、不启动阅读器验证，改完即止。

## 提交

- 每完成一次改动立即提交，不推送远端。
- 每次改动先递增对应改动源的版本号：`py` 改 `pyproject.toml` 的 `version`，`web` 改 `web/package.json` 的 `version`；升哪一位由改动本身决定，两个源的版本互不影响。
- 首行组合「改动源 + 新版本号 + 类型 + 摘要」；`docs`、`tools` 这类没有版本号的改动不递增版本，也不改动版本文件。示例：`web 1.1.0 feat: 预编译 locale 消息`、`py 3.0.1 build: 升级 unitypy`、`docs: 重写规则结构`、`tools: 补发布预检`。
- 正文逐行列出本次变更条目。

## 环境

- 引用的包、库、工具的参考源码路径记在 `AGENTS.local.md`，查 API、类型定义与行为前先去读，不凭记忆猜。
- 游戏反编译 C# 源码路径记在 `AGENTS.local.md`，查机制、字段、协议前先去读。
- 游戏本体安装目录记在 `AGENTS.local.md`，只读取，禁止写入或修改。
- `docs/` 只由 `web/` 构建产生，资源相对路径、无服务端、无 CDN；`docs/data/` 与构建产物不入库；发布走 `tools/publish-pages.ps1` 推 `gh-pages`。

除以上条目外，实现方式自由发挥。
