# 工程约束

本文件是本仓库唯一的规则真源；`.codebuddy/rules/scriptindexer.mdc` 只指回这里。本机专属的绝对路径不写进入库文件，统一手填到被 git 忽略的 `AGENTS.local.md`（模板见 `AGENTS.local.example.md`）；该文件缺失时先向用户询问路径，不凭记忆猜测。

1. **现代 Python**：Python 3.14+ 写法，uv + `pyproject.toml` 管理依赖与入口，不写 `from __future__ import annotations`。
2. **现代前端**：Vue 3.5 SFC + TypeScript + Vite 8，pnpm 管理；源码 `web/`，产物 `docs/`。
3. **架构与质量**：状态归 Pinia，API 与组件自动导入，质量以 `pnpm lint`（ESLint）/ `pnpm format:check`（Prettier）/ `pnpm build` 通过为准。
4. **零注释**：不写任何注释与 docstring，改动触及的旧注释一并删除。
5. **不测试**：不建测试文件、不跑测试、不启动阅读器验证，改完即止。
6. **不留兼容**：不写 legacy 分支、旧键/旧数据迁移与向前兼容代码。
7. **跨平台**：路径只用 `pathlib` 或 `os.environ`，不硬编码盘符与反斜杠。
8. **先读依赖**：引用的包、库、工具的参考源码路径记在 `AGENTS.local.md`，查 API、类型定义与行为前先去读，不凭记忆猜。
9. **全英文**：代码开发一律使用英文，包含但不限于日志、报错、脚本输出与文档等。
10. **先读源码**：游戏反编译 C# 源码路径记在 `AGENTS.local.md`，查机制、字段、协议前先去读，不凭记忆猜。
11. **本体只读**：游戏本体安装目录路径记在 `AGENTS.local.md`，只读取，禁止写入或修改。
12. **自动提交**：每次任务执行完成后使用git提交，但不推送远端。
13. **静态可部署**：`docs/` 只由 `web/` 构建产生，资源相对路径、无服务端、无 CDN；`docs/data/` 与构建产物不入库；发布走 `tools/publish-pages.ps1` 推 `gh-pages`。

除以上条例外，实现方式自由发挥。
