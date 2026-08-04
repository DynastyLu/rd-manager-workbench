# 仓库卫生整理设计

**日期：** 2026-08-04
**范围：** `rd-manager-workbench` 的 Git 分支、本地临时物与根目录 README。

## 目标

使仓库的默认入口保持为远程 `main`，移除已经完全合并的开发分支与纯临时文件，并以当前“星研工作台”的运行方式更新根 README。

## 安全边界

- 仅删除已被 `main` 包含的分支；任何与 `main` 分叉的分支保留。
- 仅删除 Git 忽略且可再生成的 Codex/Superpowers 临时资料、系统元数据和异常空白文件。
- 不删除 `.env`、`backend/var/`、`outputs/`、依赖目录、构建目录或 Electron 发布包；它们可能包含用户配置、业务数据、导出物或可直接运行的安装包。
- README 只变更项目文档，不改变启动、权限或运行时行为。

## 执行设计

1. 以 `git merge-base --is-ancestor` 确认本地及远端候选分支均已经合并到 `main` 后删除。
2. 删除 `.superpowers/`、`.codex-tmp/`、`.codex-artifacts/`、`.DS_Store` 与根目录 `-.html`；它们均未被 Git 跟踪，且为历史协作过程、系统或误生成文件。
3. 将 README 组织为产品概述、仓库结构、快速启动、默认管理员与权限、知识库依赖、Electron、验证命令和本地文件约定，保留现有端口和安全边界。
4. 通过 Git 分支、忽略文件、README 关键段落和工作区状态复核；随后提交并推送 `main`。
