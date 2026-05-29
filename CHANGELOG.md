# Changelog

## v0.3.0 — 技能集群全面质量审查修复 (2026-05-29)

### 旧版修复 (comfyui-good-anima/)

**PowerShell 脚本**
- `cd WORKSPACE` → `Push-Location` (×5), config.json try/catch, `$argsFile` 加引号, `&&` → `;`
- 路径发现增加平铺结构回退

**内容一致性**
- NSFW→nsfw 统一, 分支触发词细化+去重叠, 占位符→`@mignon`, 读取导航编号修正, quality prefix 默认值

**结构优化**
- 5 个 SKILL.md 新增"默认职责"+"读取导航"表格+触发词提示

### 新版优化 (comfyui-good-anima-new/)

- NEGATIVE_PROMPT 统一, `tag_pools.json` 数据同步
- 默认参数补 cfg/sampler/scheduler, description 依赖补全, 输出字段表补 batch_size/rtx_vsr_quality
- PowerShell 平铺回退, `cd`→`Push-Location`/`Pop-Location`, 跨 skill 路径修正

### 审查方法
- QA 子代理 + review-code 六维 + security-review + tool-design + Karpathy Guidelines + Team 并行
