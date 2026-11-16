# CI 与自动发版

项目通过 [Google Release Please](https://github.com/googleapis/release-please) 管理版本、变更日志、发版 PR 和 GitHub Release。发版以 `main` 为准，维护者通过合并发版 PR 决定发布时间。

## 工作流

- [CI](../.github/workflows/ci.yml)：向 `main` 提 PR 时自动运行，也支持手动运行和被其他工作流调用。在 Ubuntu、Windows 上分别用 Node.js 22、24 执行入口语法检查、`npm test` 和 `npm pack --dry-run`。项目没有 npm 依赖，因此不需要安装步骤或 lockfile。
- [Release Please](../.github/workflows/release-please.yml)：每次推送到 `main` 时先复用完整 CI；全部通过后才更新发版 PR 或创建 Release。支持在 Actions 页面选择 `main` 后手动运行；其他分支会跳过发版。主分支的测试在这个工作流里运行，不会重复启动一套 CI。
- 发版分两段，避免在版本内容还没被完整验证时就公开：Release Please 先只创建草稿 Release（此时还没有 tag），同一工作流再把它的实际发版 commit 交给 CI，跑完整的 Ubuntu / Windows × Node.js 22 / 24 矩阵。全部通过后，从同一个 commit 通过 `npm pack` 生成 `tanzz-dsh-explore-<version>.tgz`，上传附件，最后公开 Release 并由 GitHub 创建 tag。这样即使 `main` 在前一轮 CI 执行期间前进，公开发布的内容也一定通过了完整检查。包内容沿用 [package.json](../package.json) 的 `files` 清单。
- 草稿没有 tag，Release Please 此时算不出版本边界，所以「更新发版 PR」被推迟到草稿不存在或已发布之后（通常是下一次推送到 `main`）。存在未完成的草稿时，新一轮工作流会停止并发失败，避免算出重复版本；处理方式见「失败处理」。
- 发版 PR 受 `always-update` 保护：每次运行都会按当前 `main` 重建它的分支，避免像普通分支那样因为基分支前进而卡在冲突里。
- 打包和发布留在同一工作流中，因为内置 `GITHUB_TOKEN` 创建的 tag 不会触发新的工作流。
- [Release Please](../.github/workflows/release-please.yml) 的最后一个 job 是 **Publish to npm**：Release 公开后，从同一个 commit 校验 `package.json` 版本与 tag 一致，再用 `npm publish --provenance --access public` 发布到 npm。它同样留在 Release Please 工作流里，原因与上一条相同。版本已在 npm 上时直接跳过，所以重跑失败 job 不会因为「版本已存在」再次失败。
- npm 发布 job 只能留在 Release Please 工作流里，原因同上：发版流程需要草稿 Release 的 commit 和 tag，而 `GITHUB_TOKEN` 建的 tag 不会触发新工作流。补发时不要另起工作流，直接在那个运行里 **Re-run failed jobs**——job 会先查 registry，已发布的版本自动跳过。

Actions 使用固定 commit SHA 引用第三方 action；升级时同时更新 SHA 和旁边的版本注释。

## 首次启用

1. 将配置合并到 `main`，确认仓库 Settings → Actions → General 允许使用 GitHub Actions 与这些 action。
2. 使用内置 `GITHUB_TOKEN` 时，在同一页面的 Workflow permissions 中启用 **Allow GitHub Actions to create and approve pull requests**。工作流已为发版 job 声明 `contents: write`、`issues: write`、`pull-requests: write`，普通测试只申请 `contents: read`。
3. 推荐在 Settings → Secrets and variables → Actions 中添加仓库 secret **`RELEASE_PLEASE_TOKEN`**，值为仅限本仓库的 fine-grained PAT，并授予 **Contents、Issues、Pull requests 的 Read and write 权限**。也可以不配置这个 secret，工作流会回退到内置 `GITHUB_TOKEN`。

两种 token 的区别：使用 PAT 创建或更新发版 PR，能自动运行这个 PR 的 CI。内置 `GITHUB_TOKEN` 创建或更新 PR 时，GitHub.com 当前会生成需要人工批准的工作流运行，具有仓库写权限的维护者需点击 **Approve workflows to run**；尚未启用这一机制的环境可能不生成 PR 工作流。若分支保护要求 CI 必须通过，推荐配置 PAT，避免人工批准这一步。在 Actions 页面仅对 `main` 手动运行 CI，不能替代发版 PR 对应提交的检查。以 [GitHub 的工作流触发规则](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow) 为准；[Release Please 的凭证说明](https://github.com/googleapis/release-please-action#other-actions-on-release-please-prs) 也建议使用单独 token。

Secret 只用于 Release Please job，PR 测试无需访问它。仓库或组织的 Actions 策略仍需允许这些操作。

## 日常发版

1. 功能、修复照常提 PR，合并到 `main`。若使用 squash merge，确保最终的 PR 标题符合 Conventional Commits。
2. CI 通过后，Release Please 创建或更新 `chore(main): release ...` 发版 PR，修改 [package.json](../package.json)、`CHANGELOG.md` 和 [.release-please-manifest.json](../.release-please-manifest.json)。仓库里不放预置的 `CHANGELOG.md`：Release Please 会自己建这个文件；预置一个只有标题的空文件会被它当成旧内容，多挂一个空的 `## Changelog` 小节。
3. 维护者确认版本和变更日志后合并这个 PR。
4. 主分支 CI 再次通过后，Release Please 创建草稿 Release；实际发版 commit 的完整 CI 矩阵通过后，后续 job 上传插件包、公开 Release，并由 GitHub 生成 `v<version>` tag。
5. 下一次推送到 `main` 时，Release Please 基于新 tag 继续维护下一条发版 PR。

发版 PR 不会自动合并。包名是 `@tanzz/dsh-explore`（npm 用户名作用域），发布目标 registry 固定为 `https://registry.npmjs.org/`，`publishConfig.access` 为 `public`。npm 上不带作用域的 `dsh-explore` 已被另一个无关项目占用，不要改回去。

## 发布到 npm

发布走 **Trusted Publishing（OIDC）**，不需要长期 token：

- npmjs.com 的包设置（Settings → Trusted Publisher）里已有一条 GitHub Actions 连接：仓库 `tzzs/dsh-explore`、工作流文件 `release-please.yml`、允许 `npm publish`。连接创建后状态是 Pending validation，登记页会给出验证截止时间；在截止时间前完成一次发版即可转为 validated，否则 npm 会移除这条连接，重新登记即可（需要再次 2FA）。
- 工作流只申请 `id-token: write`，没有 token 也能发布。临时兜底可以在 Settings → Secrets and variables → Actions 添加 `NPM_TOKEN`（granular token，勾选 bypass 2FA）；工作流检测到这个 secret 就写进临时 `.npmrc` 并优先用 token。注意 npm 从 2027 年 1 月起限制 bypass 2FA 的 token 直接发布，只用它应急。
- 换工作流文件名（例如把发布拆到独立文件）必须同步更新这条 trusted publisher 连接，否则 OIDC 校验会拒绝。

首次发布已完成：`@tanzz/dsh-explore@0.1.0`（2026-11-16，本地 `npm publish` 完成，因为登记 trusted publisher 前包必须已存在）。后续版本全部走发版 PR，由 Release Please 工作流里的 **Publish to npm** job 自动发布。

`npm publish` 会带上 provenance（`id-token: write` + 公开仓库），npm 页面会显示构建来源。发布前请确认 `package.json` 的 `files` 里包含 `client.js`、`index.js`、`cordis.patch.yml`、`locale/` 与 `icon.svg`——`dsh.bundle.patch` 指向的 `cordis.patch.yml` 缺失会让 DSH 拒绝安装。

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

从 npm 装指定版本：`install_bundle` 的 `target` 写 `@tanzz/dsh-explore@<version>`（例如 `@tanzz/dsh-explore@0.1.0`）。

不走 npm 也可以：克隆仓库并切到 Release 对应的 tag，让 DSH 插件管理器安装该目录；或下载 Release 的 `.tgz` 附件，解压后将 `package` 目录的绝对路径交给 `install_bundle`：

```bash
mkdir dsh-explore-release
tar -xzf tanzz-dsh-explore-0.1.0.tgz -C dsh-explore-release
# 安装目录：<绝对路径>/dsh-explore-release/package
```

目录里包含客户端代码、宿主入口、Cordis patch、语言文件和图标，无需构建。

## 失败处理

- **CI 失败**：先修复测试或打包问题，Release Please 不会越过失败的 CI 执行发版。
- **创建 PR 报权限不足**：检查 Actions 的创建 PR 开关，或 PAT 的仓库范围和权限；组织策略也可能限制写操作。
- **发版 PR 的 CI 等待批准或没有生成**：检查是否配置了 `RELEASE_PLEASE_TOKEN`；使用内置 `GITHUB_TOKEN` 时，具有写权限的维护者可在 PR 上点击 **Approve workflows to run**，环境尚未提供此功能时推荐使用 PAT。
- **草稿 Release 已创建，但发版检查、打包或上传失败**：在该次工作流运行中使用 **Re-run failed jobs**，重跑失败的检查及后续上传、发布 job；它们会继续使用原草稿的 commit 和 tag，并通过 `--clobber` 支持重复上传。失败时 Release 保持草稿，不会公开未完成的版本。若原运行已无法重跑，删掉那个草稿 Release 后重新推送即可（草稿尚未创建 tag，删除不会影响已发布版本）。不要只重新执行 Release Please job 或重新手动启动整个工作流来尝试补附件，因为它不会把已存在的 Release 再次报告为新建。
- **发版工作流报「A draft release is pending」**：说明上一次发版停在草稿阶段。优先在原运行的 **Re-run failed jobs** 里完成验证与发布；若原运行已不可用，按上一条删除草稿后重新推送。这道检查刻意阻止新一轮发版，因为草稿没有 tag 时 Release Please 会算错版本边界，可能生成重复的下一版 PR。
- **npm 发布失败（401 / 403）**：检查 `NPM_TOKEN` 是否过期、是否勾选 bypass 2FA，或 trusted publisher 是否登记了正确的仓库与工作流文件名（`release-please.yml`）。修好后在 Actions 里 **Re-run failed jobs**。
- **npm 报版本已存在**：发布前会先查 registry，已存在则跳过；若仍报错，说明 `package.json` 的版本被手工改过。不要重复发布同一版本，让发版 PR 递增版本。
- **npm 的 `latest` 指向不对**：`npm publish` 默认打 `latest` tag；补发旧版本后用 `npm dist-tag add @tanzz/dsh-explore@<version> latest` 修正。
