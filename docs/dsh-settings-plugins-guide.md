# DeepSeek Harness 设置 → 插件列表 阅读指南

> 适用对象：在 Web 界面（`dsh web`）的 设置 → 插件 里看到一长串插件名、不知道它们是干什么的用户。
> 数据来源：当前安装的 `@deepseek-ai/dsh` 0.1.0-rc.6 实际加载的 Cordis Loader 条目（`dsh-base` + `dsh-web-app` 两个 bundle 的组合），说明文字取自各包 README 与 package.json。

## 1. 这个列表到底是什么

**它是一份只读的"内部模块清单"（Cordis Loader 清单），不是可安装的插件市场。**

DeepSeek Harness 本身是用 Cordis 插件架构搭起来的：整个程序 = 一个空的根 + 按顺序叠加的一批插件行（"base" 核心层 + "web" 界面层 + 你自己的 `cordis.patch.yml` 覆盖层）。设置里的"插件"标签页就是把当前**正在运行的这一个应用**的所有零件列给你看，相当于应用自身的"组件/依赖清单"。

因此：

- 你**不需要、也不能**在这里管理它们（该标签页是只读的，见 `dsh-client-ui-settings-plugin-inventory` 的说明）。
- 绝大多数插件**默认开启、按需工作**，平时完全不用管。
- 想真正改配置，去别的入口：模型/凭据 → 设置 → 模型；权限 → 设置 → 通用（或 `/permission`）；工作区、主题、语言等各有自己的设置入口。

## 2. 怎么读这个界面

- **卡片标题 = 模块短名称**（例如 `tool-bash`、`ui-sidebar`、`session`）。
- **展开卡片 = 显示 Loader 条目 id**（例如 `@deepseek-ai/dsh-tool-bash`），以及该条目的启用/停用状态；已启用的还有彩色圆点表示根 fiber 状态（正常运行/异常等）。
- 搜索框按标题和 id 过滤。

## 3. 插件分组总览

| 分组 | 干什么 | 典型条目 |
|---|---|---|
| 核心运行框架 | 时钟、热重载、远程调用协议、API 网关 | `timer`, `hmr`, `typert*`, `api-gateway` |
| Agent 本体 | 智能体接口、主循环、系统提示词、模型选择 | `agent`, `agent-loop`, `system-prompt`, `llm*` |
| 模型与 LLM | 模型适配、重试、token 计量 | `llm-deepseek`, `llm-pi-ai`, `llm-retry`, `token-meter` |
| 工具（模型能调用的能力） | shell、文件、搜索、子代理、后台任务等 | `tool-bash`, `tool-fs*`, `tool-subagent*`, `tool-web` |
| 会话与存储 | 会话持久化、搜索、标题、投影、统计 | `session*`, `storage*`, `attachment-local` |
| 沙箱与安全 | 进程沙箱、文件沙箱、审批、权限 | `sandbox*`, `fs-sandbox`, `bash-sandbox`, `approval`, `permission` |
| 技能（Skills） | 技能注册与加载 | `skill`, `skill-filesystem`, `skill-badge`, `tool-skill` |
| 目标/计划/命令 | 目标、计划模式、斜杠命令 | `goal*`, `plan-mode`, `commands`, `command-*` |
| Web 宿主 | 网页服务器、静态资源、启动 | `webserver`, `web-startup`, `web-runtime`, `connection` |
| Web UI（界面零件） | 侧边栏、对话、设置、工具调用树等 | `ui-*` 前缀的一大批 |
| 高级能力 | 工作流、Ralph、Code 运行时、动态插件 | `tool-workflow`, `tool-ralph`, `code-runtime`, `cordis-*` |

## 4. 逐个说明（按上面分组的条目 id）

### 核心运行框架

| id | 作用 |
|---|---|
| `timer` | Cordis 框架的定时器服务，供其他插件做延迟/定时任务（内部基础设施）。 |
| `hmr` | 热模块重载：开发时修改代码后浏览器/服务自动生效（发布版空闲）。 |
| `typert` | Typert 远程调用协议的运行时注册表（内部 RPC 基础设施）。 |
| `typert-loader` | 生成的 RPC 契约的 Loader 集成（内部基础设施）。 |
| `typert-gateway` / `api-gateway` | API 网关：浏览器与后端之间 RPC 的调度/分发端点。 |

### Agent 本体

| id | 作用 |
|---|---|
| `agent` | Agent（智能体）的接口、注册表与事件词汇——"一个会话里在思考的那个东西"。 |
| `agent-loop` | 具体的主循环：思考 → 调用工具 → 输出结果，不断迭代。 |
| `agent-default-model` | 新建会话时默认使用的模型（默认 deepseek-v4-flash）。 |
| `agent-instructions` | 读取工作区里的 `AGENTS.md` / `CLAUDE.md` 指令文件，注入上下文。 |
| `agent-presets` | Agent 预设（标准 / PTC / 极简 / 创造模式）的按会话组装。 |
| `system-prompt` | 系统提示词的组装注册表。 |
| `user-questions` | 允许 Agent 在运行中向你提问的抽象层（`ask_user_question` 背后的服务）。 |
| `approval` | 用户审批机制：需要授权的高风险操作（如提权命令）会请求批准，默认拒绝（fail-closed）。 |
| `shell-env` | 维护 `DSH_*` 系列环境变量的注册表（工具无关）。 |

### 模型与 LLM

| id | 作用 |
|---|---|
| `llm` | 与提供商无关的 LLM 服务接口（抽象层）。 |
| `llm-deepseek` | DeepSeek chat-completions 适配器（当前对话走的就是它）。 |
| `llm-pi-ai` | pi-ai 多提供商适配器（默认休眠，在设置→模型里配置后才启用）。 |
| `llm-retry` | LLM 请求的按提供商路由的重试策略。 |
| `token-meter` | token 计量服务（基于对话历史重放计算用量，用于压缩等）。 |

### 工具（模型能调用的能力）

| id | 作用 |
|---|---|
| `tools` | 工具注册表与执行管线——所有 `tool-*` 注册进来、统一调度。 |
| `tool-bash` | 模型执行 shell 命令的工具（命令都经过沙箱）。 |
| `bash-sandbox` | shell 命令的沙箱执行实现。 |
| `tool-pwsh` | 模型执行 PowerShell 的工具（Windows 场景）。 |
| `pwsh-sandbox` | PowerShell 的沙箱执行实现。 |
| `tool-fs` | 模型读写/编辑文件的工具（read/write/edit）。 |
| `tool-fs-search` | 模型的文件发现工具：glob 查找文件、grep 搜索内容。 |
| `tool-str-replace-editor` | 基于字面量替换的文本编辑工具（view/create/replace/insert）。 |
| `fs-observation-policy` | 文件上下文策略：编辑前必须先读、基于观察状态做版本守卫写入。 |
| `tool-web` | 模型联网搜索/抓取的工具（web_search / web_fetch）。 |
| `web` | 联网能力的抽象层（搜索/抓取提供商注册表）。 |
| `web-search-deepseek` | DeepSeek 提供的 web 搜索实现。 |
| `tool-skill` | 模型加载技能（Skills）的工具。 |
| `tool-subagent` | 模型委派子代理的工具（spawn）。 |
| `tool-subagent-fork` | 模型派生继承当前上下文子代理的工具（fork）。 |
| `tool-subagent-control` | 全局的子代理控制工具：send_message / interrupt_agent / list_agents。 |
| `tool-subagent-list-agents` | 列出可继续的子代理（list_agents 工具本体）。 |
| `tool-subagent-report` | 子代理内部的报告工具。 |
| `tool-jobs` | 模型管理后台任务流的工具：job_output / job_list / job_kill。 |
| `tool-todo` | 模型维护任务清单的工具（todo_write）。 |
| `tool-goal` | 模型的持久目标工具（create_goal / update_goal / get_goal）。 |
| `tool-ralph` | 模型运行"全新子代理迭代循环"（Ralph loop）的工具。 |
| `tool-workflow` | 模型运行 JavaScript 编排脚本（workflow 工具）的工具。 |
| `timeout-policy` | 每个工具调用的超时策略：超时则返回 TOOL_TIMEOUT。 |
| `repeat-tool-reminder` | 防重复循环：模型反复调用相同工具时给出提醒。 |

### 会话、存储与统计

| id | 作用 |
|---|---|
| `session` | 会话存储（基于事件日志的会话记录）。 |
| `session-persistence-jsonl` | 会话的 JSONL 文件持久化后端——你的对话历史就存在这里。 |
| `session-query-sqlite` | 会话检索服务（SQLite + FTS5 全文搜索）。 |
| `session-projection` | 会话投影：从事件日志派生各类会话状态（目标、计划、统计等）。 |
| `session-projection-cache` | 投影的持久化缓存，加快冷启动恢复。 |
| `session-title` | 会话标题服务（日志驱动的标题生成）。 |
| `session-title-llm` | 用 LLM 生成会话标题的策略。 |
| `session-checkpoint-policy` | 语义检查点：在模型请求和工具副作用前做持久化，防止丢失。 |
| `session-stats` | 全会话统计（轮数、步数、LLM/工具耗时等），驱动聊天统计条。 |
| `session-telemetry-otel` | 会话遥测的 OpenTelemetry 后端。 |
| `session-log-download` | Web 端"下载会话日志"功能（导出 ZIP）。 |
| `storage` | 非会话数据的存储中心（具名后端注册表）。 |
| `storage-json` | JSON 文件 KV 存储后端。 |
| `storage-domain` | 领域数据形式：带 schema 校验、事件发射的 KV 域。 |
| `attachment-local` | 附件存储（内容寻址、只追加不可变）。 |
| `workspace` | 工作区实体注册表（记录你的工作区与最近会话）。 |
| `spill-local` / `spill-policy` | 大输出暂存：超大的工具结果写到私有文件、只留预览，避免撑爆上下文。 |
| `settings` | 用户设置抽象层。 |
| `credentials` | 凭据抽象层：设置里只存引用，密钥由提供方持有（`$DSH_HOME/.credentials.yaml`）。 |
| `message-feedback` | 单条消息的点赞/点踩与备注（每条消息旁的评价控件）。 |

### 沙箱与安全

| id | 作用 |
|---|---|
| `sandbox` | 进程沙箱抽象层（沙箱模式：read-only / workspace-write / 无沙箱）。 |
| `sandbox-policy` | 每次调用的沙箱模式解析（根据会话设置与部署默认值）。 |
| `fs-sandbox` | 文件系统的沙箱强制：写/编辑按模式限定在工作区+临时目录内，读放行。 |
| `subprocess` | 子进程抽象层（进程组管理、大输出暂存、强制终止）。 |
| `permission` | 面向用户的权限预设（沙箱模式 + 审批策略的组合开关，对应 `/permission`）。 |

### 技能（Skills）

| id | 作用 |
|---|---|
| `skill` | 技能（Skill）提供方注册表。 |
| `skill-filesystem` | 从本地文件系统读取技能的提供方。 |
| `skill-badge` | 内置的 dsh 徽章技能（新手引导类技能）。 |

### 目标 / 计划 / 命令

| id | 作用 |
|---|---|
| `goal` | 会话内持久目标的状态与生命周期服务。 |
| `goal-round-driver` | 目标自动续跑轮次的驱动（带竞态防护）。 |
| `command-goal` | 目标相关的斜杠命令。 |
| `plan-mode` | 计划模式：先给计划、经你确认再执行（对应 `/plan`）。 |
| `commands` | 斜杠命令注册表（`/` 菜单的来源）。 |
| `command-compact` | 手动压缩会话的斜杠命令。 |
| `command-feedback` | 记录会话反馈的斜杠命令。 |
| `compaction-basic` | 上下文太长时的自动压缩（按 token 计量触发 + LLM 摘要）。 |
| `tool-result-pruner` | 工具结果节点的头/中/尾修剪，压缩时保留关键内容。 |

### 子代理 / 工作流基础设施

| id | 作用 |
|---|---|
| `subagent` | 子代理抽象层（按名字注册的提供方）。 |
| `subagent-spawn-in-process` | 进程内 spawn 后端：运行全新子代理。 |
| `subagent-fork-in-process` | 进程内 fork 后端：用父会话前缀作为子代理种子。 |
| `workflow-worker-thread` | workflow 引擎：在 worker 线程里执行模型写的编排脚本。 |
| `code-runtime` | Code 运行时抽象层（PTC 模式用）：模型写一段 TypeScript 程序在宿主上执行。 |

### Web 宿主（后端那一半）

| id | 作用 |
|---|---|
| `web-startup` | Web 应用的启动参数解析（`--host` / `--port` / `--trusted-host`）。 |
| `web-runtime` | Web 运行时粘合：解析前端构建产物、提供 `webRuntime` 信任信息、打印 `dsh web:` URL。 |
| `webserver` | 路由注册：HTTP 与 WebSocket 路由、静态文件回退。 |
| `client-hmr` | 开发期浏览器热重载驱动（重建后自动刷新页面）。 |
| `modules` | 客户端模块系统：浏览器端如何加载各插件代码。 |
| `connection` | 浏览器 ↔ 后端的连接层（HTTP POST + WebSocket 双流）。 |
| `api-remotes` | 远程调用（BFF）组装与 Host/Agent/Session 查找策略。 |
| `client-runtime` | 客户端核心服务：插槽注册表、会话运行时。 |
| `locale` | 语言设置（中文/英文，跟随系统或手动选）。 |
| `directory-picker` | 工作区目录选择（浏览器内浏览 or 系统原生选择器，自动适配）。 |
| `plugin-inventory` | 把当前 Loader 插件状态投影给浏览器（**你正看的这个列表就是它提供的**）。 |

### Web UI（界面零件，`ui-*`）

| id | 作用 |
|---|---|
| `ui-theme` | 主题（浅色/深色/跟随系统）。 |
| `ui-layout` | 三栏应用框架（可拖拽分栏）。 |
| `ui-sidebar` | 左侧会话列表（多级树、搜索、分组、状态点）。 |
| `ui-settings` | 设置页面域的基础插件。 |
| `ui-settings-general` | 设置 → 通用（欢迎页、权限默认值等）。 |
| `ui-settings-models` | 设置 → 模型（模型选择、API Key 配置）。 |
| `ui-settings-plugins` | 设置 → 插件分区（标签栏 + 可配置的宿主插件卡片）。 |
| `ui-settings-plugin-inventory` | 设置 → 插件里的**只读插件列表标签页**（就是本文讲的这个界面）。 |
| `ui-conversation` | 对话主界面（消息流、输入框）。 |
| `ui-tool` | 工具调用树的渲染（每次工具调用的折叠/展开视图）。 |
| `ui-cordis` | 动态插件面板：查看/开关模型动态定义插件（`cordis_define`）。 |
| `ui-workflow-run` | workflow 运行的可视化节点。 |
| `ui-deliverables` | 产出文件展示与可点击的最终文件引用。 |
| `ui-workspace` | 工作区选择器（侧边栏与空状态的"选择工作区"）。 |
| `ui-input-trigger` | 输入框的 `/` 与 `@` 触发菜单。 |
| `ui-commands` | 斜杠命令的 UI 呈现。 |
| `ui-skill` | 技能引用与技能工具的展示行。 |
| `ui-subagent` | 子代理会话目录、续跑路由与 `@` 引用来源。 |
| `ui-jobs` | 会话头部的后台任务列表。 |
| `ui-goal` | 输入框上方的目标条（GoalBar）。 |
| `ui-message-feedback` | 每条消息的点赞/点踩按钮。 |
| `ui-model-selection` | 模型选择（`/model` 菜单）。 |
| `ui-permission` | 权限设置（`/permission` 菜单 + 通用设置里的默认值）。 |
| `ui-agent-preset` | Agent 预设界面（当前会话的预设座位、组合编辑器）。 |
| `ui-plan` | 计划模式的输入框控件（进入/确认/退出计划）。 |
| `ui-user-questions` | 运行中向你提问的弹窗/接管输入框的界面。 |
| `ui-trajectory` | 轨迹时间线（一次对话的耗时分布视图）。 |

## 5. 常见问题

**这些插件能禁用吗？**
界面本身是只读的，不能在这里启停。配置层的启停属于高级玩法：编辑 profile 目录（`~/.dsh/profiles/web/cordis.patch.yml`）里的补丁行，或改 bundle。没有把握不要动——它们是这个应用能跑起来的原因。

**会不会影响性能？**
绝大多数插件是"声明 + 按需激活"，不工作时不消耗。列表里的状态点和 fiber 状态只是运行状态展示。

**为什么有这么多？**
每个能力被拆成独立小插件（一个插件只干一件事），这是 Cordis 架构的刻意设计：可组合、可替换、可裁剪。你看到的 ~130 行里，约一半是"后端能力"，另一半是"界面零件"。

**为什么有的名字很像（比如 tool-subagent / tool-subagent-fork / tool-subagent-control）？**
它们是不同的工具：spawn（全新子代理）、fork（继承上下文）、control（给子代理发消息/打断/列表）。同理 `tool-fs` vs `tool-fs-search` 是"读写文件" vs "搜索文件"。

**官方有没有更详细的说明？**
每个包在安装目录下都有 README / README.zh.md（路径：`~/.dsh/profiles/node_modules/@deepseek-ai/<包名>/README.zh.md`），想深挖某个插件时去读对应的那一份即可。官方目前没有面向终端用户的逐插件指南；本文档即为此整理。

## 6. 如何安装第三方插件

**先说结论：没有插件商店，界面里没有下载按钮。** 第三方插件 = 一个 npm 包，通过 `dsh plugin` 命令（它是 pnpm 的转发器）装进 profile。装好后它会作为一行出现在 设置 → 插件 清单里。

### 6.1 安装命令

```sh
# 把 <包名> 装进 web profile（等价于在 ~/.dsh/profiles/web/ 里执行 pnpm add <包名>）
dsh plugin --profile web add <包名>

# 其他 pnpm 子命令同样可用
dsh plugin --profile web remove <包名>
dsh plugin --profile web update
dsh plugin --profile web list
```

- profile 不存在时会先按模板自动初始化。
- 该命令支持任意 pnpm 参数：`add` / `remove` / `update` / `upgrade`，以及 `file:` / `link:` / git 地址等依赖写法。

### 6.2 装完如何让它生效（关键）

安装后分两种情况：

1. **包自带 bundle 补丁**（package.json 里声明了 `dsh.bundle.patch`）→ `dsh plugin` 会自动把它追加进 `dsh.profile.bundles` 层栈，它的 `cordis.patch.yml` 会在下次启动时自动应用。**重启 `dsh web` 即可，无需手动配置。**
2. **普通 cordis 插件**（大多数第三方插件，没有 `dsh.bundle` 声明）→ 会装成普通依赖并打印一行 warning，**需要手动接线**：在 `~/.dsh/profiles/web/cordis.patch.yml` 里加一行插入：

```yaml
- insert:
    - id: my-plugin            # 自定义 id，全文件内唯一即可
      name: 'my-plugin-package-name'
```

然后重启 `dsh web`。重启后回 设置 → 插件，就能在清单里看到它了。

### 6.3 注意事项

- **git 托管的插件**：pnpm 默认阻止其 `prepare` 构建脚本，报错时按提示把对应的 key 加进 `~/.dsh/profiles/web/pnpm-workspace.yaml` 的 `allowBuilds` 里，再重跑一次。
- **兼容性**：本发行版内置的是 cordis **4.0.1**（`@deepseek-ai/cordis`），插件需适配 cordis 4.x 的插件 API（`apply(ctx)` / 默认导出）。
- **host 端插件**（服务端能力，如工具、存储）重启即生效；**浏览器端插件**（UI 组件类）需要重新构建前端产物，已安装的发行版没有直接命令支持——这是当前版本的边界。
- **只读清单里出现 = 已生效**：设置里的插件列表是当前 Loader 树的投影，能搜到就说明它真的加载了。

### 6.4 去哪找插件

- npm registry：搜索 `cordis plugin`、`@cordisjs/*` 等关键词。
- 官方仓库 `deepseek-ai/deepseek-harness` 自带一组 vendored cordis 插件（timer、hmr、include、group、loader），可作参考实现。
- 想先实验不弄脏 web profile：`dsh plugin --profile mytest add <包名>` 会基于默认模板新建独立 profile，配坏了不影响主环境。
