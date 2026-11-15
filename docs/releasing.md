# CI 与自动发版

项目通过 [Google Release Please](https://github.com/googleapis/release-please) 管理版本、变更日志、发版 PR 和 GitHub Release。发版以 `main` 为准，维护者通过合并发版 PR 决定发布时间。

## 工作流

- [CI](../.github/workflows/ci.yml)：向 `main` 提 PR 时自动运行，也支持手动运行和被其他工作流调用。在 Ubuntu、Windows 上分别用 Node.js 22、24 执行入口语法检查、`npm test` 和 `npm pack --dry-run`。项目没有 npm 依赖，因此不需要安装步骤或 lockfile。
- [Release Please](../.github/workflows/release-please.yml)：每次推送到 `main` 时先复用完整 CI；全部通过后才更新发版 PR 或创建 Release。支持在 Actions 页面选择 `main` 后手动运行；其他分支会跳过发版。主分支的测试在这个工作流里运行，不会重复启动一套 CI。
- 发版分两段，避免在版本内容还没被完整验证时就公开：Release Please 先只创建草稿 Release（此时还没有 tag），同一工作流再把它的实际发版 commit 交给 CI，跑完整的 Ubuntu / Windows × Node.js 22 / 24 矩阵。全部通过后，从同一个 commit 通过 `npm pack` 生成 `local-dsh-explore-<version>.tgz`，上传附件，最后公开 Release 并由 GitHub 创建 tag。这样即使 `main` 在前一轮 CI 执行期间前进，公开发布的内容也一定通过了完整检查。包内容沿用 [package.json](../package.json) 的 `files` 清单。
- 草稿没有 tag，Release Please 此时算不出版本边界，所以「更新发版 PR」被推迟到草稿不存在或已发布之后（通常是下一次推送到 `main`）。存在未完成的草稿时，新一轮工作流会停止并发失败，避免算出重复版本；处理方式见「失败处理」。
- 发版 PR 受 `always-update` 保护：每次运行都会按当前 `main` 重建它的分支，避免像普通分支那样因为基分支前进而卡在冲突里。
- 打包和发布留在同一工作流中，因为内置 `GITHUB_TOKEN` 创建的 tag 不会触发新的工作流。

Actions 使用固定 commit SHA 引用第三方 action；升级时同时更新 SHA 和旁边的版本注释。

## 首次启用

1. 将配置合并到 `main`，确认仓库 Settings → Actions → General 允许使用 GitHub Actions 与这些 action。
2. 使用内置 `GITHUB_TOKEN` 时，在同一页面的 Workflow permissions 中启用 **Allow GitHub Actions to create and approve pull requests**。工作流已为发版 job 声明 `contents: write`、`issues: write`、`pull-requests: write`，普通测试只申请 `contents: read`。
3. 推荐在 Settings → Secrets and variables → Actions 中添加仓库 secret **`RELEASE_PLEASE_TOKEN`**，值为仅限本仓库的 fine-grained PAT，并授予 **Contents、Issues、Pull requests 的 Read and write 权限**。也可以不配置这个 secret，工作流会回退到内置 `GITHUB_TOKEN`。

两种 token 的区别：使用 PAT 创建或更新发版 PR，能自动运行这个 PR 的 CI。内置 `GITHUB_TOKEN` 创建或更新 PR 时，GitHub.com 当前会生成需要人工批准的工作流运行，具有仓库写权限的维护者需点击 **Approve workflows to run**；尚未启用这一机制的环境可能不生成 PR 工作流。若分支保护要求 CI 必须通过，推荐配置 PAT，避免人工批准这一步。在 Actions 页面仅对 `main` 手动运行 CI，不能替代发版 PR 对应提交的检查。以 [GitHub 的工作流触发规则](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow) 为准；[Release Please 的凭证说明](https://github.com/googleapis/release-please-action#other-actions-on-release-please-prs) 也建议使用单独 token。

Secret 只用于 Release Please job，PR 测试无需访问它。仓库或组织的 Actions 策略仍需允许这些操作。

## 日常发版

1. 功能、修复照常提 PR，合并到 `main`。若使用 squash merge，确保最终的 PR 标题符合 Conventional Commits。
2. CI 通过后，Release Please 创建或更新 `chore(main): release ...` 发版 PR，修改 [package.json](../package.json)、[CHANGELOG.md](../CHANGELOG.md) 和 [.release-please-manifest.json](../.release-please-manifest.json)。
3. 维护者确认版本和变更日志后合并这个 PR。
4. 主分支 CI 再次通过后，Release Please 创建草稿 Release；实际发版 commit 的完整 CI 矩阵通过后，后续 job 上传插件包、公开 Release，并由 GitHub 生成 `v<version>` tag。
5. 下一次推送到 `main` 时，Release Please 基于新 tag 继续维护下一条发版 PR。

发版 PR 不会自动合并。项目目前使用 `@local/dsh-explore` 包名且 `private: true`，工作流只创建 GitHub Release 和 `.tgz` 附件，不发布到 npm registry，也不需要 npm token。

## 提交与版本规则

[release-please-config.json](../release-please-config.json) 使用 `node` 策略，tag 形如 `v0.1.0`，不带包名前缀。

| 提交示例 | 作用 |
| --- | --- |
| `fix(canvas): keep running branches visible` | patch，例如 `0.1.0` → `0.1.1` |
| `feat(canvas): add branch search` | minor，例如 `0.1.0` → `0.2.0` |
| `feat!: change the persisted tree format` 或带 `BREAKING CHANGE:` footer | 当前 `0.x` 阶段升 minor；到 `1.x` 后升 major |
| `docs: ...`、`chore: ...`、`ci: ...` | 默认不会单独触发新版本 |

仓库接入时还没有 tag，因此 manifest 初始为 `{}`，由 `initial-version: "0.1.0"` 指定首个 Release 的版本。首次发版会汇总已有历史中的可发版提交；之后 Release Please 自动记录已发版本并按新增提交递增。不要预先把 `0.1.0` 写进初始 manifest：那会把它当作已有版本并直接计算下一个版本。

平时不手工运行 `npm version`、改 manifest 或创建 release tag；让发版 PR 一起更新这些信息。

## 安装指定版本

可以克隆仓库并切到 Release 对应的 tag，然后让 DSH 插件管理器安装该目录；也可以下载 Release 的 `.tgz` 附件，解压后将 `package` 目录的绝对路径交给 `install_bundle`：

```bash
mkdir dsh-explore-release
tar -xzf local-dsh-explore-0.1.0.tgz -C dsh-explore-release
# 安装目录：<绝对路径>/dsh-explore-release/package
```

目录里包含客户端代码、宿主入口、Cordis patch、语言文件和图标，无需构建。

## 失败处理

- **CI 失败**：先修复测试或打包问题，Release Please 不会越过失败的 CI 执行发版。
- **创建 PR 报权限不足**：检查 Actions 的创建 PR 开关，或 PAT 的仓库范围和权限；组织策略也可能限制写操作。
- **发版 PR 的 CI 等待批准或没有生成**：检查是否配置了 `RELEASE_PLEASE_TOKEN`；使用内置 `GITHUB_TOKEN` 时，具有写权限的维护者可在 PR 上点击 **Approve workflows to run**，环境尚未提供此功能时推荐使用 PAT。
- **草稿 Release 已创建，但发版检查、打包或上传失败**：在该次工作流运行中使用 **Re-run failed jobs**，重跑失败的检查及后续上传、发布 job；它们会继续使用原草稿的 commit 和 tag，并通过 `--clobber` 支持重复上传。失败时 Release 保持草稿，不会公开未完成的版本。若原运行已无法重跑，删掉那个草稿 Release 后重新推送即可（草稿尚未创建 tag，删除不会影响已发布版本）。不要只重新执行 Release Please job 或重新手动启动整个工作流来尝试补附件，因为它不会把已存在的 Release 再次报告为新建。
- **发版工作流报「A draft release is pending」**：说明上一次发版停在草稿阶段。优先在原运行的 **Re-run failed jobs** 里完成验证与发布；若原运行已不可用，按上一条删除草稿后重新推送。这道检查刻意阻止新一轮发版，因为草稿没有 tag 时 Release Please 会算错版本边界，可能生成重复的下一版 PR。
