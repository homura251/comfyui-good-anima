# Changelog

## v0.3.2 — Danbooru CLI 入口精简与批量输入修复 (2026-05-30)

- `danbooru-tags.exe` 增加 `--batch-stdin`，批量检索可直接从 stdin 读取 JSON。
- `danbooru-tags.exe` 兼容 UTF-8 BOM，降低 Windows PowerShell 写入 JSON 时的解析失败风险。
- `danbooru-tags` skill 默认从当前 skill 目录直接调用 `bin/danbooru-tags.exe`，不再依赖路径发现脚本。
- 删除 `danbooru-tags/bin/setup-dir.ps1`，避免 ExecutionPolicy 阻断主流程。
- README / README_EN / 相关 skills 的批量检索说明统一改为 `--batch-stdin` 优先；`--batch-file` 仅保留为落盘复查备选。
- `comfyui-manager` 默认从当前 `workspace` 目录运行，删除 `workspace/setup-workspace.ps1` 路径发现脚本。
- `run_workflow_args.js` 兼容 args JSON 的 UTF-8 BOM，并增加 `validate` 模式；批量提交示例改为先验证、再用非阻塞 `submit` 入队并保存 job manifest。

## v0.3.0 — 技能集群全面质量审查修复 (2026-05-29)

### 旧版修复 (comfyui-good-anima/)

**PowerShell 脚本**

- `cd WORKSPACE` → `Push-Location` (×5), config.json try/catch, `$argsFile` 加引号, `&&` → `;`
- 路径发现增加平铺结构回退
- 嵌入脚本抽取为独立 `.ps1` 文件（`workspace/setup-workspace.ps1`、`bin/setup-dir.ps1`），SKILL.md 净减 ~170 行

**奥卡姆剃刀精简**

- 删除全部 `⚠️` 装饰符与 `**粗体**` 强调
- 删除 `本文件包含...references/提供...` meta 引导行
- 合并跨段重复声明、裁剪过度举例（miko 6→3 query）
- 旧版 5 个 SKILL.md 合计净减 ~120 行

**内容一致性**

- NSFW→nsfw 统一, 分支触发词细化+去重叠, 占位符 →`@mignon`, 读取导航编号修正, quality prefix 默认值

**结构优化**

- 5 个 SKILL.md 新增"默认职责"+"读取导航"表格+触发词提示

### comfyui-good-anima 优化

- NEGATIVE_PROMPT 统一, `tag_pools.json` 数据同步
- 默认参数补 cfg/sampler/scheduler, description 依赖补全, 输出字段表补 batch_size/rtx_vsr_quality
- PowerShell 平铺回退, `cd`→`Push-Location`/`Pop-Location`, 跨 skill 路径修正

## v0.3.1 — 运行时路径与 Codex CLI 验证修复 (2026-05-30)

- `setup-dir.ps1` 目录发现不再过早依赖 `bin/danbooru-tags.exe`，先定位 skill 目录，再在执行前报告 CLI 缺失。
- `setup-workspace.ps1` / `setup-dir.ps1` 增加整包嵌套安装发现路径。
- `comfyui-manager` runtime 解析避免把 `workspace/outputs` 的父目录误当 runtime root。
- `workspace/config.json` 默认输出目录改为 `runtime/comfyui-manager/outputs`，缓存读取优先 runtime outputs。
- 修正 `danbooru-tags/SKILL.md` 代码围栏与 dot-source 调用说明。
- 补回随机候选与随机图复核护栏。
- 已覆盖到本地 Codex CLI skills 目录并验证：5 个 SKILL frontmatter 正常、Markdown 围栏成对、`danbooru-tags.exe` 查询成功、`comfyui-skill info/deps check` 可读取默认 Anima workflow。

### 审查方法

- QA 子代理 + review-code 六维 + security-review + tool-design + Karpathy Guidelines + Team 并行
