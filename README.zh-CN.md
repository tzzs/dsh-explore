<p align="center">
  <img src="assets/hero.svg" width="760" alt="一条对话分出多条路径" />
</p>

<h1 align="center">DSH 探索</h1>

<p align="center">
  把一条对话摊成一张能自己长枝的画布。<b>DeepSeek Harness</b> 的分支对话插件。
</p>

[![CI](https://github.com/tzzs/dsh-explore/actions/workflows/ci.yml/badge.svg)](https://github.com/tzzs/dsh-explore/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/tzzs/dsh-explore)](https://github.com/tzzs/dsh-explore/releases)
[![License: MIT](https://img.shields.io/github/license/tzzs/dsh-explore)](LICENSE)
![Platform: DeepSeek Harness](https://img.shields.io/badge/platform-DeepSeek%20Harness-3B6FD4)

[English](README.md) | **简体中文**

---

## 这是什么

DSH 里的对话是一条线：A → B → C。但真实的思考不长这样——同一个回答上，人往往同时想问好几件互不相干的事，问完之后又都压在历史里，没法并排看。

DSH 探索在每个会话里加一个 **「无限探索」** 页签：把一轮轮问答铺到一张无限画布上，**任意一个回答都可以成为新的分岔口**。从某个节点再问一句，就长出一根新枝，它带着从根到这里的完整上下文继续往下走，枝条之间互不污染。

新枝不是把历史拼进 prompt，而是 `ctx.sessions.fork({ sessionId, atSeq })` 建出来的真实会话：它原样继承到该回答为止的事件前缀，工具、审批、流式、取消、重试都和普通会话一样。

## 功能

- **无限画布** —— 拖拽平移、滚轮缩放（20%–200%）、适应画布，右下角小地图可点击跳转并显示当前视口。在支持的 DSH 页面布局中，画布延伸到标题和输入框后方。
- **两个方向都支持** —— 工具栏上是双向的布局开关：**从上到下** 或 **从左到右**。两个选项同时可见，当前那个是按下态，所以不用靠画布形状去猜现在朝哪个方向。选择保存在当前浏览器中，对其他会话也生效。
- **跟随宿主外观** —— 界面跟随 DSH 的八种语言（中、英、德、西、法、日、葡、俄）和浅色 / 深色主题：层级阴影、浮层背景、滚动条和原生表单控件都随主题走。
- **任意回答开新枝** —— 卡片右上角的 `+` 就是追问入口，就地长出一张输入卡，回车发送后新节点立刻出现。
- **并行分支** —— 几条枝可以同时跑。正在回答的卡片带实时进度行：转圈指示器 +「正在思考… / 正在调用 read / 正在输出…」+ 第 N 步 + 已用秒数，正文按流式 token 边写边渲染，并带「停止」。
- **看得见在想什么** —— 光有耗时看不出智能体在忙什么。正在跑的卡片下有一条「思考尾巴」，实时显示模型最新写下的一行；停下来之后卡片底部留一个可展开的「思考过程」，全屏阅读里也在。模型不思考就不显示这一节。
- **等你回答** —— 分支停在提问或审批时，卡片改说「等你回答… / 等你授权…」并带一圈强调边框；画布自动展开到它并居中，工具条上的「N 个在等你」可点击跳转。正在跑的节点所在路径不会被默认折叠藏起来。
- **定位最新** —— 一键展开到最新节点的祖先路径并把那张卡片居中；最新按创建时间判定，并行完成顺序打乱也不会跳错。
- **折叠与搜索** —— 第三层起默认折叠，但通往「正在跑 / 在等你」节点的路径始终展开；`Ctrl/Cmd+F` 聚焦搜索框，回车逐个跳转命中节点并自动展开祖先路径。
- **全屏阅读** —— 点卡片正文打开阅读层（Esc / 点背景 / × 关闭），长回答不用挤在 320px 里。
- **删除与恢复** —— 删除只写墓碑并归档对应的 fork 会话，工具栏可一键恢复；会话日志本身从不改写。

## 环境要求

- **DeepSeek Harness**（桌面版或 Web 版），且 profile 允许安装插件。
- **Node.js 22+** —— 只用于开发；插件没有构建步骤，也没有自己的 npm 依赖。

## 安装

插件发布在 npm，包名 `@tanzz/dsh-explore`。在 DSH 里安装：

1. 打开插件管理（`plugin_manager`）→ `install_bundle`；
2. `target` 填包名 `@tanzz/dsh-explore`；要锁版本就写 `@tanzz/dsh-explore@0.1.0`；
3. 安装完成后，会话页签里会多出「无限探索」/ Infinite Exploration。

> 包名是安装标识，不是展示名：展示名来自 `locale/`，中文「DSH 探索」、英文「DSH Explore」。npm 上不带作用域的 `dsh-explore` 已被另一个无关项目占用，所以这里用 npm 用户名作用域。

改插件本身时不必走 npm：克隆仓库，让 `install_bundle` 的 `target` 直接填**这个目录的绝对路径**（profile 里会记成 `link:` 依赖），改完热更新。

```bash
git clone https://github.com/tzzs/dsh-explore.git
# target 填这个目录，例如 E:\workspaces\dsh-explore
```

要装某个具体版本又不想走 npm，下载那个 Release 的 `.tgz` 附件，解压后把 `package` 目录的绝对路径交给 `install_bundle`：

```bash
mkdir dsh-explore-release
tar -xzf tanzz-dsh-explore-0.1.0.tgz -C dsh-explore-release
# 安装目录：<绝对路径>/dsh-explore-release/package
```

## 命名

四层名字各管一件事，刻意不互相套用：

| 层 | 名字 | 出现在哪 | 为什么是这个 |
|---|---|---|---|
| 仓库 | `dsh-explore` | GitHub URL、`git clone` | 公开地址，一旦发布就不改；短、全小写、无空格 |
| 包 | `@tanzz/dsh-explore` | `package.json`、npm registry、profile 依赖 | 与仓库同名，安装时一眼对得上；npm 上 `dsh-explore` 被占用，所以用作用域；改它要卸载重装 |
| 插件（展示名） | 「DSH 探索」/ `DSH Explore` | 插件列表、设置页 | 人读的产品名；前缀 `DSH` 说明它属于哪个宿主 |
| 视图（页签） | 「无限探索」/ `Infinite Exploration` | 会话里的第三个页签 | 描述这个视图在做什么，不是产品名；跟随界面语言切换 |

「无限探索」是**视图名**而不是插件名，所以没有把它并进展示名（「DSH 无限探索」会让产品名和页签名撞在一起，英文也会变成冗长的 `DSH Infinite Exploration`）。同理没有把页签改成 `Explore`——那会丢掉「无限」这层意思，而画布确实是无限延展的。

## 目录结构

```
client.js                        客户端视图：事件投影、布局、画布、卡片、阅读层
index.js                         宿主侧空实现（这个插件只在客户端做事）
cordis.patch.yml                 向 profile 插入一行 dsh-explore
locale/zh.json                   中文展示名与描述
locale/en.json                   英文展示名与描述
icon.svg                         插件图标
assets/hero.svg                  README 头图（一条线分出多条路径）
test/render-smoke.cjs            渲染冒烟：假 React 真渲染整个视图，断言中英两套文案
test/canvas-visibility.cjs       可见性回归：在跑/等你节点必须被布局并画出，等待态文案与投影白名单
test/session-rebind.cjs          重新绑定：换 eventSource 后重订阅、空窗口不剪枝、冷会话要 open
test/theme-tokens.cjs            主题守卫：色值不写死、关键 token 必须存在、主按钮用反相前景
test/motion.cjs                  动效：镜头插值、手势中断、导航替换、减少动态效果与清理
test/wheel-scroll.cjs            滚轮归属：内层能滚就滚，滚到头也不缩放画布
test/live-clock.cjs              运行中的卡片按墙钟计时，且全插件只有一个定时器
test/layout-direction.cjs        双向布局、不等高节点与折叠分支
test/host-overlay.cjs            宿主覆盖层、区域测量、阅读层与回退
test/locale-parity.cjs           八套语言表：键集合一致、{占位符} 对齐、不串字符集
test/reasoning.cjs               思考过程：实时尾巴、折叠区、无思考不显示、重试清空、封顶与真实截断计数
test/reasoning-persist.cjs       思考不落盘、重开从日志里回来、父子连线不丢
test/real-log.cjs                真实日志端到端检查（可选，吃一个 session.v4.jsonl.zstd）
docs/design.md                   设计文档：数据模型、取舍、已知缺口
docs/releasing.md                CI、Release Please 与 npm 发布
.github/workflows/               CI、Release Please 与手动的 npm 发布工作流
```

## 实现要点

整个视图就是一个客户端插件；完整设计（数据模型、取舍、已知缺口）见 [docs/design.md](docs/design.md)。

- **注册点**：`conversation.view`，`id: tree`、`order: 5`、`label` 是一个 thunk（每次投影重新求值），与 Chat / Trajectory 并列。
- **界面文案跟随宿主语言**：所有可见文本都是 `dsh-explore` 命名空间下的键，通过客户端 locale 服务查表；切换语言时页签标题和整个视图一起切换。没有 locale 插件的 profile 会退回内置的中英表（按 `document.documentElement.lang` 选择）。
- **节点是日志的投影**：读取会话的 `entries`（持久事件 + 暂态 `assistant/live-chunk`），把一个 turn 投影成一张卡片；不额外写记录，所以在 Chat 里继续聊，树上就会自然长节点。
- **等待态没有专门事件**：宿主里 `ask_user_question` 与审批都只是「工具还没返回」——等回答期间不发 `turn/end`，`running` 也保持 `true`。插件用 `tool/call` 的 `ask_user_question`（`callId` 在 `tool/result` 里结清）和 `approval/asked → approval/decided` 算出「在等你」，把卡片从「正在调用工具」改成「等你回答 / 等你授权」。`user/message` 的 `source.kind` 只有 `user` 与 `user-question-reply` 两种，投影两端都认。
- **思考过程已经在事件窗口里**：模型把思考写进 `reasoning` 内容块——实时是暂态 `assistant/live-chunk` 上的 `reasoning-delta`，落定后是持久 `assistant/message` 里的 `{ type: 'reasoning', text }`。两者都原样到达插件，所以一次投影同时覆盖「正在想」和「想完了」：在跑时卡片显示最新一行做「思考尾巴」，落定后收进可展开的「思考过程」（折叠时仍写出最后一段，并在被截断时说明）。没有思考的模型不渲染这一节。重试会复用同一个 turn/step，所以先把上一次尝试的思考清掉。每张卡最多保留 12000 字，丢了字数按「每个块送达过的字节 − 保留长度」算出来，而不是累加计数器——同一个块会被裁不止一次。思考**不写进 `localStorage` 快照**：它能从日志重建，而快照里还放着重建不出来的父子连线。
- **正在跑的路径不折叠**：布局只走「未折叠」的节点，被折叠的节点连位置都没有、根本不会被画。所以通往「正在跑 / 在等你」节点的祖先路径一律不套用默认折叠；节点进入运行态时还会把路径展开并持久化，停在等用户时再把画布移过去。工具条上的运行计数与「在等你」计数都是跳转按钮。
- **会话会被重新绑定**：离开对话后宿主会释放它的引用，引用归零时 scope 被回收、`Session` 实例连同事件窗口一起丢掉；再进来时 `materializeScope` 会造一个新的 `eventSource`，窗口从空开始。所以订阅跟着 `eventSource` 换（旧的自动退订）、空窗口不当作「会话是空的」去剪枝、冷会话主动 `open()` 一次——否则直接在「无限探索」页签上切回来会得到一张空画布，而先点「回对话」再切回来又正常。`test/session-rebind.cjs` 守住这条。
- **分叉是真实会话**：`ctx.sessions.fork({ sessionId, atSeq })`，子会话天然继承到该回答为止的前缀上下文；每根枝会出现在会话列表里，插件会把它改名成 `⟂ 父问题 · 新问题` 便于辨认。
- **父子关系存在本地**：这一版 fork 不记录 `parentSession`，树形关系由插件在 `localStorage` 里维护，同时保存折叠状态、墓碑和布局方向。卡片高度在运行时测量。
- **主题**：颜色全部使用 `--dsw-alias-*` CSS 变量，浅色 / 深色主题自动跟随，不写死色值。主按钮的 `--dsw-alias-brand-primary` 在深浅主题下会反相（浅色近黑、深色近白），所以文字必须用配套的 `--dsw-alias-label-primary-foreground`，不能写死 `#fff`；行内代码用 `label-primary` 的 7% 着色（官方 inline-code token 在浅色下几乎是白的，放在白卡片上会看不见）。字体接组合后的 `--dsw-font-family` / `--ds-font-family-code`——DSH 已把用户字体和内置默认栈拼在一起，直接读组合 token 才能保住字形回退。`test/theme-tokens.cjs` 守住这些规则。

## 开发

```bash
npm test                      # 下面十三条一起跑（package.json 里的 scripts.test）

node --check client.js        # 语法
node test/render-smoke.cjs    # 渲染冒烟：把整个视图真渲染一遍，并断言中英两套文案
node test/canvas-visibility.cjs  # 可见性回归：在跑/等你的节点必须被画出来，等待态文案与投影白名单
node test/session-rebind.cjs  # 重新打开会话：scope 重建后换订阅、空窗口不剪枝、冷会话要 open
node test/theme-tokens.cjs    # 主题守卫：色值不写死、token 必须存在、主按钮用反相前景 token
node test/motion.cjs          # 动效：画布移动、手势中断、导航替换、减少动态效果与清理
node test/wheel-scroll.cjs    # 滚轮归属：思考框能滚就滚，滚到头也不缩放画布
node test/live-clock.cjs      # 耗时按墙钟每秒走，事件之间也不停；只有一个定时器
node test/layout-direction.cjs # 双向布局、不等高节点和折叠分支
node test/host-overlay.cjs     # 宿主覆盖层、区域测量、阅读层与回退
node test/locale-parity.cjs    # 八套语言表的键、占位符与字符集
node test/reasoning.cjs        # 思考过程：实时尾巴、折叠区、无思考不显示、重试清空、封顶与真实截断计数
node test/reasoning-persist.cjs # 快照策略：思考不落盘，重开从日志里回来，父子连线不丢
```

`node test/real-log.cjs <一个 session.v4.jsonl.zstd>` 可以拿真实日志跑一遍全链路，属于可选检查，不在 `npm test` 里。

`client.js` 是客户端插件（`window.__ModuleLoader__.load` 的惰性工厂），改完客户端热更新立即生效。注意样式表在每次 `apply()` 都会重写同一个 `<style>` 节点——如果只在节点已存在时跳过，热更新后的新规则永远不会生效。

## CI 与发版

向 `main` 提 PR 时，`.github/workflows/ci.yml` 在 Ubuntu / Windows × Node.js 22 / 24 上执行 `node --check index.js`、`npm test`、`npm pack --dry-run`。没有安装步骤——插件和测试都没有 npm 依赖，仓库里也没有 lockfile。

发版走 Google Release Please，版本由 Conventional Commits 决定：它创建或更新一条发版 PR（改 `package.json`、manifest 和 `CHANGELOG.md`）；合并后发版 job 在发版 commit 上跑完整矩阵，`npm pack` 出 `tanzz-dsh-explore-<version>.tgz`，附到 GitHub Release 上再公开，tag 由 GitHub 生成为 `v<version>`，同一 commit 还会带 provenance 发布到 npm。`@tanzz/dsh-explore@0.1.0` 是已发布的基线版本，之后每次发版都由这个工作流自动发布。

首次启用（Actions 权限、可选的 `RELEASE_PLEASE_TOKEN`、npm Trusted Publishing）见 [CI 与自动发版说明](docs/releasing.md)。

## 参与贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。提交信息和 PR 标题遵循 [Conventional Commits](https://www.conventionalcommits.org/)——Release Please 靠它算下一个版本；缺陷报告和功能请求走 issue 模板。

## 安全

见 [SECURITY.md](SECURITY.md)。安全问题请私下报告，不要开公开 issue。

## 已知限制

- **树关系只在这台机器的这个浏览器里**：换浏览器、清站点数据或换 profile，树枝会平掉（每个会话自己那条链还在，但接不回同一棵树）。
- **树是会话级的**：没有「把几棵树摆在一起」的本子。
- **出错**：出错只体现在卡片状态上，不会自动跳过去；提问和审批则会（见「等你回答」）。
- **插件之外的 fork**：在 DSH 里、插件之外 fork 出来的会话识别不到，会被当成新树的根。

## 许可证

[MIT](LICENSE) © 2026 tzzs

参与本项目即表示同意遵守[行为准则](CODE_OF_CONDUCT.md)。
