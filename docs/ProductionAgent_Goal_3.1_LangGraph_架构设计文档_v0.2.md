# ProductionAgent Goal 3.1 — LangGraph 架构设计文档

**版本：v0.2**
**状态：Draft for Review**
**上游依赖：Goal 3.0 Contract Hardening（必须先完成）**
**下游消费：Goal 3.2 LangGraph Implementation**

---

## 1. 文档目的与范围

### 1.1 目的

定义 ProductionAgent 引入 LangGraph 编排层的完整架构契约，使 Goal 3.2 可以在不做架构决策的前提下直接实现。

本文档的成功标准是：**实现者读完之后，不需要再问"这里该怎么设计"，只需要问"这里怎么写代码"。**

### 1.2 范围内

状态模型、图拓扑、节点契约、路由规则、修订收敛策略、冻结协议、持久化、HITL、失败处理、可观测性、测试策略、迁移路径。

### 1.3 明确的非目标

| 非目标 | 说明 |
|---|---|
| 重新设计内容方法论 | Agent 的创意职责与提示词不在本次范围 |
| 重写 Agent 逻辑 | 只加适配层，Agent 必须可脱离 LangGraph 独立运行与测试 |
| 改变 artifact 目录结构 | 只增加 manifest 与版本目录，不改已有文件语义 |
| 引入模型微调 / 历史学习 | 属于 Goal 3.3，且必须依赖发布后真实数据 |
| 多 episode 的图内并行 | 多 episode 由图外 worker 池解决（见 §14.3） |

### 1.4 职责边界

```
LangGraph 负责：状态、调度、路由、Checkpoint、中断恢复、事件记录、预算控制
Agent   负责：内容理解、创意判断、文案生成、质量评估
Artifact 负责：承载全部内容真相
```

**判定规则：任何需要读文件内容才能做的决策，属于 Agent；任何只读元数据/分数/issue 就能做的决策，属于 LangGraph。**

---

## 2. 设计原则（可用于裁决争议）

| # | 原则 | 裁决用法 |
|---|---|---|
| P1 | Artifact 是唯一事实来源 | State 里出现任何正文内容 → 拒绝 |
| P2 | 路由是查表，不是推理 | 出现"让 LLM 决定下一个节点" → 拒绝 |
| P3 | 昂贵操作在冻结点之后 | 任何创意层修改触发渲染 → 拒绝 |
| P4 | 所有节点幂等 | 出现原地覆盖文件 → 拒绝 |
| P5 | 交付 best，不交付 last | |
| P6 | 卡住升级给人，不静默通过 | 出现"轮次耗尽后直接进入下一阶段" → 拒绝 |
| P7 | 节点薄、Agent 厚 | 节点函数里出现业务逻辑 → 拒绝 |
| P8 | 一切阈值进配置，不进代码 | |

---

## 3. 系统总览

```
                          Product Input
                               │
                               ▼
┌──────────────── 内容循环（廉价 · 高频）────────────────┐
│  Research → Story → Viral → Script → Oral → Visual     │
│                        │                                │
│         ┌──────────────┼──────────────┬────────────┐   │
│         ▼              ▼              ▼            ▼   │
│    Audience       Retention        Fact       Compliance│
│     Critic          Critic       Guardian       Check   │
│         └──────────────┴──────────────┴────────────┘   │
│                        ▼                                │
│                   Gate Evaluator                        │
│                        ▼                                │
│              pass? ──no──► Issue Router ──► 单 owner 修订│
│                │                    (回到对应节点)       │
└────────────────┼────────────────────────────────────────┘
                 │ yes
                 ▼
         Story / Content Approval（人工，冻结前唯一创意闸门）
                 ▼
         ██ CONTENT FREEZE ██  → content_manifest.json
                 ▼
┌──────────────── 生产循环（昂贵 · 低频）────────────────┐
│      TTS → Asset Gen → Render → Delivery Critic         │
│                        │                                │
│         分级重跑 L1/L2/L3（不解冻）                      │
│         L4 需要 Unfreeze Request（人工批准，默认上限 1） │
└─────────────────────────┬───────────────────────────────┘
                          ▼
              Final Publication Approval（人工）
                          ▼
                       Published
```

---

## 4. 契约层（继承自 Goal 3.0，在此冻结）

> 本节是 Goal 3.2 的实现输入。任何变更需走 ADR。

### 4.1 Artifact 契约

```python
SCHEMA_VERSION = "1.0.0"

class ArtifactRef(TypedDict):
    name: str                       # 逻辑名：research | story_brief | hook_plan | script | narration | visual_plan | ...
    path: str                       # content/episode-015/script/v3/script.md
    version: int
    sha256: str
    produced_by: str                # node name
    model: str
    prompt_version: str
    rubric_version: NotRequired[str]
    created_at: str                 # ISO8601
    depends_on: dict[str, str]      # 上游 artifact name -> 生成时刻的 upstream sha256
    stale: bool                      # 上游变更后置 true
    locked_ranges: list[list[int]]   # 人工编辑保护区 [[start,end], ...]
    cost_usd: float
```

**目录约定（新增，不破坏旧结构）：**

```
content/episode-015/
  research/v1/research.md
  story/v2/story_brief.md
  script/v3/script.md
  narration/v3/narration.md
  visual/v2/visual_plan.md
  _manifest/content_manifest.json      # 冻结产物
  _runs/{run_id}/events.jsonl          # 事件日志
  _runs/{run_id}/run_report.md         # 自动生成的人读报告
  latest.json                          # name -> ArtifactRef 指针
```

**写入协议（幂等）：** 写 `v{n+1}/` 目录 → 计算 sha256 → 原子替换 `latest.json`。**禁止原地覆盖。**

### 4.2 Issue 契约（Routing 的唯一输入）

```python
Category = Literal[
    "fact",          # 事实错误 / 无来源支撑
    "research_gap",  # 缺少必要素材
    "story",         # 结构、角度、情绪弧
    "hook",          # 前 3 秒 / 悬念 / 信息差
    "script",        # 逻辑、信息密度、节奏
    "oral",          # 口语化、断句、可读性
    "visual",        # 分镜、画面表达、图文匹配
    "delivery_tech", # 时长、音画同步、字幕、规格
    "compliance",    # 平台规则 / 广告法禁用语 / 品牌安全
]
Severity = Literal["blocker", "major", "minor"]

class Locator(TypedDict):
    artifact: str
    version: int
    line_range: NotRequired[list[int]]
    shot_id: NotRequired[str]
    timecode: NotRequired[str]

class Issue(TypedDict):
    id: str                     # iss-{round}-{seq}
    round: int
    raised_by: str              # critic node
    category: Category
    severity: Severity
    dimension: str              # 对应 rubric 维度名
    owner: str                  # 由 §9.1 归属矩阵派生，critic 不得自行指定
    locator: Locator
    evidence: str               # 观察到的事实，不含建议
    fix_instruction: str        # 可执行的修改指令
    expected_effect: str        # "hook_3s >= 7.5"
    do_not_break: list[str]     # 不得劣化的维度
    status: Literal["open","assigned","resolved","wontfix","escalated"]
    resolved_in_version: NotRequired[int]
```

### 4.3 Evaluation 契约

```python
class DimensionScore(TypedDict):
    name: str
    score: float      # 0-10
    floor: float      # 一票否决线
    weight: float     # 加权总分权重，同一 rubric 内合计为 1

class Evaluation(TypedDict):
    eval_id: str
    round: int
    critic: str
    target: dict[str, str]       # artifact name -> sha256（评的是哪一版）
    rubric_version: str
    model: str
    prompt_version: str
    dimensions: list[DimensionScore]
    weighted_score: float
    gate: Literal["pass","warn","fail"]
    issue_ids: list[str]
    created_at: str
    cost_usd: float
```

> **强制要求**：`rubric_version` / `prompt_version` / `model` 缺一不可。缺失则跨 episode 分数不可比，Goal 3.3 的横向比较将全部作废。

### 4.4 Agent 适配接口（保证"不重写 Agent 逻辑"）

```python
class AgentInvocation(TypedDict):
    agent: str
    mode: Literal["create", "revise"]
    inputs: dict[str, str]            # artifact name -> 运行时从磁盘读取的内容
    instructions: list[Issue]         # revise 模式下的修改指令
    upstream_diff: NotRequired[str]   # 上游变更 diff，用于增量重写
    constraints: dict                 # do_not_break / locked_ranges / style_guide
    config: dict                      # model / temperature / prompt_version

class AgentResult(TypedDict):
    outputs: dict[str, str]           # artifact name -> 正文
    structured: dict                  # critic 的结构化输出
    usage: dict                       # tokens / cost_usd / latency_ms
    warnings: list[str]

def run_agent(inv: AgentInvocation) -> AgentResult: ...
```

**关键约束：`run_agent` 不导入任何 LangGraph 符号。** 保证 Agent 可在 CLI、Notebook、单测中独立运行。

---

## 5. State 设计

### 5.1 完整定义

```python
Phase = Literal[
    "init","research","story","viral","script","oral","visual",
    "content_eval","content_revision","content_approval",
    "frozen","production","delivery_eval","production_revision",
    "unfreeze_review","final_approval","published","halted"
]

class Budget(TypedDict):
    max_rounds_content: int          # 默认 4
    max_rounds_production: int       # 默认 2
    max_rounds_per_owner: int        # 默认 2
    max_unfreeze: int                # 默认 1
    max_cost_usd: float
    max_wallclock_s: int
    spent_cost_usd: float
    spent_wallclock_s: int
    rounds_used: dict[str, int]      # owner -> count
    unfreeze_used: int

class ProductionState(TypedDict):
    schema_version: str
    episode_id: str
    run_id: str
    phase: Phase
    round: int

    artifacts:   Annotated[dict[str, ArtifactRef], merge_artifacts]
    best:        Annotated[dict[str, ArtifactRef], pick_best]
    evaluations: Annotated[list[Evaluation], append_dedupe("eval_id")]
    issues:      Annotated[dict[str, Issue], upsert_issues]
    gates:       Annotated[dict[str, str], dict_merge]        # critic -> pass|warn|fail
    revision_log:Annotated[list[dict], append_dedupe("rev_id")]
    events:      Annotated[list[dict], append_dedupe("event_id")]

    budget:      Annotated[Budget, merge_budget]
    approvals:   Annotated[dict[str, dict], dict_merge]

    content_manifest: NotRequired[dict]     # 冻结快照
    strategy_level: int                      # 修订策略升级档位 0-4
    halt_reason: NotRequired[str]
```

### 5.2 Reducer 表（**LangGraph 实现的第一优先级**）

> 任何在**同一 superstep**被多于一个节点写入的字段，必须有 reducer，否则 LangGraph 抛 `InvalidUpdateError`。四个 critic 并行时会同时写 `evaluations` / `issues` / `events` / `budget`。

| 字段 | Reducer | 语义 | 并发安全性 |
|---|---|---|---|
| `episode_id` / `run_id` / `schema_version` | 首写不可变 | 二次写入抛错 | — |
| `phase` | last-write-wins，**仅编排节点可写** | Critic 节点禁止写 phase | 由约定保证 |
| `round` | `max` | | 交换律成立 |
| `artifacts` | `merge_artifacts` | 按 name 取 version 更大者；同 version 不同 hash → 抛错 | 交换律成立 |
| `best` | `pick_best` | 按 `weighted_score` 取高；并列取 version 小者 | 交换律成立 |
| `evaluations` | `append_dedupe("eval_id")` | 按 id 去重追加 | 幂等 |
| `issues` | `upsert_issues` | 按 id upsert；status 只允许单调迁移 `open→assigned→resolved/wontfix/escalated` | 幂等 |
| `gates` | `dict_merge` | critic 名为键，互不重叠 | 交换律成立 |
| `revision_log` / `events` | `append_dedupe(id)` | | 幂等 |
| `budget` | `merge_budget` | 成本/时长累加，`rounds_used` 按 key 取 max | 交换律成立 |
| `approvals` | `dict_merge` | | 交换律成立 |
| `strategy_level` | `max` | | 交换律成立 |

> **为什么用 `append_dedupe` 而不是 `operator.add`**：节点内重试与 checkpoint 恢复都可能造成重复写入。裸 `operator.add` 会让事件日志和成本统计悄悄翻倍。**这是本文档中最容易被忽略、且事后最难排查的一条。**

**Reducer 必须通过的属性测试**：交换律（写入顺序无关）、幂等（重复写入结果不变）、可 JSON 序列化。

### 5.3 Schema 版本与 Checkpoint 迁移

- `schema_version` 写入 state 与每个 checkpoint。
- 启动恢复时对比：`major` 不一致 → **拒绝恢复并明确报错**；`minor` 不一致 → 执行 `migrations/{from}_to_{to}.py`。
- 变更规则：只允许**加字段（带默认值）**；删字段/改语义必须升 major 并提供迁移函数。
- 在途 episode 数量 > 0 时禁止升 major，需先排空或显式迁移。

---

## 6. 依赖图与 Staleness 传播

> 这是防止"脚本讲 A 故事、分镜画 B 故事"的唯一机制。

### 6.1 依赖 DAG

```
research
  └─ story_brief
       └─ hook_plan
            └─ script
                 ├─ narration
                 └─ visual_plan
                      └─ [production: audio / assets / render]
```

### 6.2 传播规则

1. 节点产出 artifact 时，写入 `depends_on = {上游name: 上游当前sha256}`。
2. 任一 artifact 的 sha256 变化 → 遍历 DAG，凡 `depends_on[X] != X.sha256` 的下游全部置 `stale = true`（**递归传播**）。
3. **节点入口守卫**：若任一输入 artifact `stale == true`，本节点必须重跑，不得跳过。
4. **冻结前置条件**：`stale` artifact 数量必须为 0。
5. 重跑采用 **diff-aware 增量重写**：传入 `upstream_diff` + 上一版正文 + `do_not_break` + `locked_ranges`，而非从零重写。全量重写会引入新问题，破坏收敛。

### 6.3 人工编辑回流

人工在审批环节直接编辑 artifact 时：写为新版本 → 重算 hash → 触发下游 stale → 被编辑区间登记进 `locked_ranges`，后续自动修订**不得覆盖**该区间，仅可在其外围调整。

---

## 7. Graph 拓扑

### 7.1 分层结构

主图只负责阶段推进与人工闸门，两个循环各自为 subgraph，避免条件边组合爆炸。

```
main_graph:
  START → init → content_subgraph → content_approval(interrupt)
        → freeze → production_subgraph → final_approval(interrupt)
        → publish → END
  (任意节点 → halt，当预算耗尽/不可恢复错误)
```

### 7.2 content_subgraph

| 边 | 类型 | 条件 |
|---|---|---|
| START → research | 普通 | |
| research → story_director | 普通 | |
| story_director → viral_director | 普通 | |
| viral_director → script_writer | 普通 | |
| script_writer → oral_rewriter | 普通 | |
| oral_rewriter → visual_director | 普通 | |
| visual_director → **fan-out** | 并行 | 四路并发 |
| {audience_critic, retention_critic, fact_guardian, compliance_check} → gate_evaluator | 汇聚 | |
| gate_evaluator → 条件边 | 条件 | `pass` → END(subgraph)；`fail` → issue_router；`budget/stall` → escalate |
| issue_router → 条件边 | 条件 | 按归属矩阵路由到唯一 owner 节点 |
| {各 owner 节点} → downstream_refresh | 普通 | 重生成 stale 下游 |
| downstream_refresh → fan-out | 并行 | 重新全量评估 |

> **注意：修订后必须重跑全部 critic，不能只重跑失败项。** 只重跑失败项 = 看不见回归。四个 critic 并行，成本可接受。

### 7.3 production_subgraph

| 边 | 条件 |
|---|---|
| START → tts → asset_gen → render → delivery_critic | 普通 |
| delivery_critic → 条件边 | `pass` → END；`L1` → render；`L2` → asset_gen；`L3` → tts；`L4` → unfreeze_review |
| unfreeze_review | `interrupt()` 人工决策 |

### 7.4 关于 LangGraph 版本风险

LangGraph API 演进较快（`interrupt` / `Command` / `RetryPolicy` / `CachePolicy` 在不同版本行为不同）。

**要求**：锁定 minor 版本，并将所有 LangGraph 符号封装在 `orchestration/lg_compat.py` 单一模块内，业务代码不直接 import langgraph。

---

## 8. Node 契约

### 8.1 统一包装器

所有节点通过装饰器接入，节点函数本身不写业务逻辑（P7）。

```python
@production_node(
    name="script_writer",
    inputs=["story_brief", "hook_plan", "research"],
    outputs=["script"],
    cost_tier="low",
    idempotent=True,
    cacheable=True,
    retry=RetryPolicy(max_attempts=3, backoff="exponential"),
    timeout_s=180,
)
def script_writer(state: ProductionState) -> dict:
    ...
```

包装器统一承担：输入解析与 stale 守卫 → 缓存命中检查 → 调用 `run_agent` → 输出 schema 校验 → 写新版本 artifact + 哈希 → staleness 传播 → 成本/时长累计 → 事件发射 → 错误分类。

**节点返回值必须是 partial state update（dict），禁止返回完整 state。**

### 8.2 节点清单

| Node | 循环 | 输入 | 输出 | 成本档 | 可作 owner | 幂等 | 可缓存 |
|---|---|---|---|---|---|---|---|
| research_agent | 内容 | product_input | research | 中 | ✅ | ✅ | ✅ |
| story_director | 内容 | research | story_brief | 低 | ✅ | ✅ | ✅ |
| viral_director | 内容 | story_brief, research | hook_plan | 低 | ✅ | ✅ | ✅ |
| script_writer | 内容 | story_brief, hook_plan, research | script | 低 | ✅ | ✅ | ✅ |
| oral_rewriter | 内容 | script | narration | 低 | ✅ | ✅ | ✅ |
| visual_director | 内容 | script, narration, story_brief | visual_plan | 低 | ✅ | ✅ | ✅ |
| audience_critic | 内容 | script, narration | evaluation | 低 | ❌ | ✅ | ❌ |
| retention_critic | 内容 | hook_plan, script, visual_plan | evaluation | 低 | ❌ | ✅ | ❌ |
| fact_guardian | 内容 | script, research | evaluation | 低 | ❌ | ✅ | ❌ |
| compliance_check | 内容 | narration, visual_plan | evaluation | 极低 | ❌ | ✅ | ❌ |
| gate_evaluator | 内容 | evaluations | gates, decision | 零（纯计算） | ❌ | ✅ | — |
| issue_router | 内容 | issues | routing decision | 零（纯计算） | ❌ | ✅ | — |
| downstream_refresh | 内容 | stale artifacts | 重生成 | 低 | ❌ | ✅ | ✅ |
| tts | 生产 | narration | audio | **高** | ✅ | ✅ | ✅ 段级 |
| asset_gen | 生产 | visual_plan | assets | **高** | ✅ | ✅ | ✅ 镜级 |
| render | 生产 | audio, assets | video | **高** | ✅ | ✅ | ✅ |
| delivery_critic | 生产 | video | evaluation | 中 | ❌ | ✅ | ❌ |

> **Critic 节点永远不能作为 owner** —— 评估者不改稿，这是职责分离的硬约束。
> **gate_evaluator / issue_router 是纯函数节点**，不调 LLM，保证路由 100% 可复现、可单测。

### 8.3 ADR-001：Oral Judge 的处置

**决策**：不设为顶层节点，内联为 `oral_rewriter` 内部的自检循环（最多 2 次），产出计入该节点 usage。

**理由**：Oral Judge 发现的问题 owner 恒为 oral_rewriter 自身，提升到顶层只会增加一次图往返和一次 checkpoint 写入，不产生任何路由价值。

**推翻条件**：若 oral 类 issue 在黄金集上占比 > 25%，则升为顶层 critic 以获得独立评分曲线。

### 8.4 ADR-002：新增 Compliance Check

**决策**：在内容循环增加极低成本的合规检查节点（平台规则、广告法禁用语、绝对化表述、医疗/功效宣称）。

**理由**：目标平台（小红书/抖音）对表述违规的处罚是限流，成片后才发现的成本极高，而检查本身几乎不花钱。放在冻结前是唯一合理位置。

---

## 9. Routing 设计

### 9.1 归属矩阵（issue.category → owner，唯一映射）

| category | owner node | 主 artifact | 触发 stale 的下游 |
|---|---|---|---|
| `fact` | research_agent | research | story_brief → … → visual_plan |
| `research_gap` | research_agent | research | 同上 |
| `story` | story_director | story_brief | hook_plan → … |
| `hook` | viral_director | hook_plan | script → … |
| `script` | script_writer | script | narration, visual_plan |
| `oral` | oral_rewriter | narration | （audio） |
| `visual` | visual_director | visual_plan | （assets, render） |
| `delivery_tech` | production_agent（分级） | audio/assets/render | — |
| `compliance` | 视 locator 定位到 narration/visual_plan 的 owner；blocker 直接升级人工 | | |

> **约束：一个 category 只能映射一个 owner。** 该矩阵是配置文件 `config/ownership.yaml`，不是代码。

### 9.2 优先级（拓扑深度，非严重度优先）

```
1. compliance(blocker)   → 直接人工，不自动改
2. fact / research_gap
3. story
4. hook
5. script
6. oral
7. visual
8. delivery_tech
```

**理由**：上游修改必然使下游 stale，先修下游是纯浪费。

### 9.3 选择算法

```python
def select_target(state) -> RoutingDecision:
    open_issues = [i for i in state["issues"].values() if i["status"] == "open"]
    if not open_issues:
        return RoutingDecision(action="pass")

    # 合规 blocker 直接升级
    if any(i["category"] == "compliance" and i["severity"] == "blocker" for i in open_issues):
        return RoutingDecision(action="escalate", reason="compliance_blocker")

    ranked = sorted(open_issues, key=lambda i: (
        UPSTREAM_RANK[i["category"]],
        -SEVERITY_WEIGHT[i["severity"]],
    ))
    owner = ranked[0]["owner"]

    if state["budget"]["rounds_used"].get(owner, 0) >= state["budget"]["max_rounds_per_owner"]:
        return RoutingDecision(action="escalate", reason=f"owner_budget_exhausted:{owner}")

    # 同一 owner 的全部 open issue 一次性批量下发
    batch = [i for i in ranked if i["owner"] == owner]
    return RoutingDecision(action="revise", owner=owner, issues=batch)
```

### 9.4 单 owner 原则

**每轮只修一个 owner。** 多点同时修改会让"分数变化归因于哪次修改"变得不可能，进而使 Goal 3.3 的历史学习失去数据基础。

配置开关 `allow_parallel_minor_fix: false`，v1 默认关闭，列为 Open Question。

---

## 10. Revision 与收敛控制

### 10.1 单轮流程

```
路由选定 owner
   → owner 节点 diff-aware 重写（新版本 artifact）
   → downstream_refresh 重生成全部 stale 下游
   → 四 critic 全量并行重评
   → gate_evaluator 计算接受判据
   → accept ? 更新 best : 回滚指针 + 策略升级
```

### 10.2 接受判据（防退化，四条同时满足）

```python
def accept(new: Eval, best: Eval, targeted_dims: set[str], cfg) -> bool:
    return (
        no_open_blocker(new)                                              # 1 无 blocker
        and all(d.score >= d.floor for d in new.dimensions)               # 2 无维度跌破底线
        and new.weighted_score >= best.weighted_score + cfg.epsilon       # 3 总分实质提升
        and no_dim_regression(new, best, max_drop=cfg.max_drop)           # 4 无维度显著下滑
        and targeted_improved(new, best, targeted_dims, cfg.target_gain)  # 5 本轮目标维度确实改善
    )
# 默认：epsilon=0.1, max_drop=0.5, target_gain=0.5
```

> 判据 5 是区分"真的改好了"和"碰运气总分抖上去了"的关键，v0.1 没有这一条。

### 10.3 被拒后的策略升级（v0.1 完全缺失）

| 档位 | 策略 | 触发 |
|---|---|---|
| L0 | 原 prompt + issue 指令 | 默认 |
| L1 | 更强模型 / 提高推理预算 | 第一次被拒 |
| L2 | 收窄改写范围至 `locator` 命中片段 | 第二次被拒 |
| L3 | best-of-N（N=3 候选，取评分最高） | 第三次被拒 |
| L4 | 升级人工 | 第四次被拒 |

被拒时 artifact 指针回滚到 `best`，被拒版本保留在磁盘并在 `revision_log` 标记 `rejected`（用于后续分析，不用于交付）。

### 10.4 停滞检测

任一条件成立即 `escalate`：

- 连续 2 轮 `accept == false`
- 连续 2 轮 `Δweighted_score < epsilon`
- 同一 issue id 连续 3 轮未 resolved
- `rounds_used[owner] >= max_rounds_per_owner`
- 任一预算维度耗尽

**升级人工时必须在事件日志写明"为什么放弃自动修订"，并附最近 3 轮分数轨迹。禁止静默通过（P6）。**

### 10.5 预算模型

停止条件 = `min(轮次上限, 成本上限, 墙钟上限)`，任一触发即停。默认值放 `config/budget.yaml`，可按 episode 覆盖。

### 10.6 Best 版本交付

`state.best` 逐 artifact 维护历史最佳引用。冻结时取 `best` 而非 `artifacts`（latest）。`run_report.md` 必须写明"最终选择 v{n} 的理由"。

---

## 11. 冻结与解冻协议

### 11.1 冻结前置条件（全部满足）

```
✅ 所有 content gate == pass
✅ open blocker == 0 且 open major == 0
✅ stale artifact == 0
✅ content_approval 已获人工批准
✅ 预算未耗尽
```

### 11.2 冻结产物

```json
{
  "episode_id": "015",
  "frozen_at": "2026-...",
  "frozen_by": "human:alice",
  "artifacts": {
    "script":      {"version": 3, "sha256": "..."},
    "narration":   {"version": 3, "sha256": "..."},
    "visual_plan": {"version": 2, "sha256": "..."}
  },
  "gate_snapshot": {"audience": 8.1, "retention": 7.8, "fact": 9.5, "compliance": "pass"},
  "rubric_version": "1.3"
}
```

**生产循环只读 manifest，不读 `latest.json`。** 这样即使有人误改文件，生产阶段也不会被污染。

### 11.3 解冻协议（解决 v0.1 §6.3 的自相矛盾）

Delivery Critic 发现的问题按可修复层级分类：

| 级别 | 问题类型 | 处理 | 是否解冻 |
|---|---|---|---|
| L1 | 字幕、转场、时长、封面、平台规格 | 重跑 render（复用 audio+assets） | ❌ |
| L2 | 单镜头素材质量 | 重生成该镜头 asset + render | ❌ |
| L3 | 读音、断句、语速 | 仅重跑受影响段落 TTS + render | ❌ |
| L4 | 故事/脚本/事实层面问题 | **Unfreeze Request** | ✅ 需人工批准 |

**解冻要求**：severity == blocker + 人工批准 + `unfreeze_used < max_unfreeze`（默认 1）。解冻后 `phase` 退回 `content_revision`，已产出的生产资产标记 stale 但**保留在磁盘用于缓存复用**。

**解冻是全系统最贵的事件，必须被计数、被报告、被复盘。**

---

## 12. 生产循环的幂等与缓存

### 12.1 缓存键

```
cache_key = sha256(node_name + prompt_version + model + normalized_input_hash + params_hash)
```

命中则复用已有产物并记 `cache_hit` 事件，成本记 0。

### 12.2 分段缓存（成本优化的关键）

- **TTS 按段落级缓存**：narration 分段哈希，只有变更段落重新合成。改一句话不该重跑全片配音。
- **Asset 按镜头级缓存**：`shot_id + prompt_version + visual_plan 片段 hash`。
- **Render 全量**：但输入若全部命中缓存则跳过。

> 该机制可使修订循环的边际成本下降一个数量级，是双循环架构真正兑现价值的地方。

---

## 13. Human-in-the-Loop

### 13.1 两个正式闸门

| 闸门 | 位置 | 审查内容 | 可执行动作 |
|---|---|---|---|
| Content Approval | 冻结前 | 故事方向、Hook、结构、评分卡 | approve / reject+结构化理由 / 直接编辑 |
| Final Publication | 发布前 | 成片质量、合规、平台适配 | approve / reject / 打回 L1-L4 |

### 13.2 升级触发（非计划性人工介入）

修订不收敛 · 预算耗尽 · Critic 结论冲突（如 audience pass 而 retention fail 且分差 > 阈值）· compliance blocker · 解冻请求 · 不可恢复错误。

### 13.3 中断机制

- 使用 LangGraph 动态 `interrupt()`，通过 `Command(resume=...)` 恢复。
- **必须使用持久化 checkpointer**（禁用 `MemorySaver`）。审批可能挂起数小时至数天，进程重启后必须能原样恢复。
- 中断载荷（人看到的东西）必须包含：分数卡（当前 vs 上一版 vs best）、open issues 列表、artifact diff、成本与轮次消耗、系统建议动作。**不要让人去翻文件。**

### 13.4 人工编辑回流（v0.1 缺失）

1. 人工编辑写为新版本 artifact，`produced_by = "human:{user}"`。
2. 重算 hash → 触发下游 stale。
3. 被编辑区间登记 `locked_ranges`，后续自动修订不得覆盖。
4. Reject 理由必须按 Issue schema 结构化收集 —— **这是校准 Critic rubric 最宝贵的数据源**，不要用自由文本。

---

## 14. 可靠性、持久化与并发

### 14.1 错误分类与处置

| 类型 | 例子 | 策略 |
|---|---|---|
| transient | 429 / 5xx / 超时 | 指数退避重试 3 次 |
| content_policy | 模型拒答 | 降级 prompt 或换模型重试 1 次 → 人工 |
| schema_invalid | Critic 输出不符 schema | 附 schema 错误结构化重试 2 次 → 标记该 eval 失败 → 人工 |
| deterministic | 缺失上游 artifact / 配置错误 | 立即失败，不重试 |
| budget_exceeded | | 直接升级人工 |

**所有节点必须幂等**，checkpoint 恢复后重跑不产生副作用（依赖 §4.1 写入协议 + §5.2 去重 reducer）。

### 14.2 持久化

- Checkpointer：SQLite（dev）/ PostgreSQL（prod），`thread_id = episode_id`。
- Checkpoint 只存 state（全是引用），artifact 存文件系统/对象存储。**Checkpoint 体积应保持在 KB 级**——若出现 MB 级，说明有人往 state 里塞了正文，违反 P1。
- 保留策略：每 episode 保留全部 checkpoint 至发布后 30 天。

### 14.3 并发模型

- **图内不做 episode fan-out。** 多 episode 由外层 worker 池调度，每 episode 一个 thread。
- 每 episode 加分布式锁，防止同一 episode 被双重执行（这会造成 artifact 版本号竞态）。
- 全局并发上限受 LLM 供应商速率限制约束，配置化。

---

## 15. 可观测性

### 15.1 双层设计

| 层 | 载体 | 用途 |
|---|---|---|
| 恢复层 | Checkpointer | 断点续跑，机器读 |
| 分析层 | `_runs/{run_id}/events.jsonl`（append-only） | 人读 + 统计，独立于 LangGraph |

### 15.2 事件 schema

```json
{
  "event_id": "...", "ts": "...", "run_id": "...", "episode_id": "015",
  "round": 2, "node": "viral_director", "action": "revise",
  "reason": "iss-002-01 hook_3s=5.0 < floor 7.0",
  "scores_before": {"hook_3s": 5.0, "weighted": 6.9},
  "scores_after":  {"hook_3s": 7.6, "weighted": 7.8},
  "accepted": true, "strategy_level": 0,
  "model": "...", "prompt_version": "...", "tokens": 4210,
  "cost_usd": 0.031, "duration_ms": 8100, "cache_hit": false
}
```

### 15.3 run_report.md（自动生成，Goal 3.2 交付物）

必须包含：执行时间线、分数演进表（按轮次 × 维度）、每轮修订的原因与效果、被拒版本及原因、成本与耗时明细、最终版本选择理由、人工介入记录。

### 15.4 关键指标

- Per-episode：成本、墙钟、修订轮数、缓存命中率、人工介入次数
- Per-node：失败率、P50/P95 耗时、平均成本
- Per-category：issue 频次 → **反哺上游 prompt 改进**（Goal 3.3a 的主要输入）

---

## 16. 配置与版本管理

```
config/
  ownership.yaml       # category → owner 归属矩阵
  rubric.yaml          # 维度 / 权重 / floor，带 rubric_version
  budget.yaml          # 轮次 / 成本 / 时长上限
  routing.yaml         # 优先级、单 owner 开关、策略升级档位
  models.yaml          # 各节点模型、温度、prompt_version
  thresholds.yaml      # epsilon / max_drop / target_gain
```

所有配置带版本号并写入每次运行的事件日志。**代码中出现魔法数字视为缺陷。**

---

## 17. 测试策略

| 层级 | 内容 | 验收 |
|---|---|---|
| Stub 模式 | `AGENT_BACKEND=stub`，全部 agent 返回 fixture | CI 内 < 10s 跑通全部分支，零成本 |
| Reducer 属性测试 | 交换律 / 幂等 / 序列化 | 100% 覆盖所有 reducer |
| Routing 表驱动测试 | 归属矩阵每行一 case + 优先级组合 case + 预算耗尽 case | 分支全覆盖 |
| 依赖传播测试 | 改上游 → 验证下游 stale 递归正确、冻结被正确阻止 | |
| 收敛仿真 | 注入合成分数序列：单调上升 / 震荡 / 停滞 / 回归 | 验证接受判据、回滚、策略升级、停滞升级 |
| Replay 测试 | 每个节点后 kill → 恢复 → 比对最终 state | 无重复 append、无重复计费 |
| HITL 测试 | interrupt 后重启进程 → resume | 状态完整 |
| 黄金集回归 | 10–15 个历史 episode 跑内容循环 | Critic 打分与人工排序相关性达标 |

> **Stub 模式是本节最重要的一项。** 图的分支组合会迅速爆炸，没有零成本的确定性测试就无法做回归。

---

## 18. 迁移计划

| 阶段 | 范围 | 回退开关 | 完成判据 |
|---|---|---|---|
| M0 | Goal 3.0 契约硬化 + 基线采集 | — | Critic 结构化输出上线；10–15 episode 基线数据成表 |
| M1 | **影子模式**：LangGraph 跑内容循环，产物写 `_shadow/`，不影响交付 | 默认关闭 | 5 个 episode 影子产物与人工产物完成比对 |
| M2 | 内容循环正式承接（research→visual→critics→revision），生产仍手工 | `ORCHESTRATOR=manual\|langgraph` | 单入口自动产出通过质量门的冻结包 |
| M3 | 冻结协议 + 生产循环接入 + 分级重跑 + 缓存 | 同上 | 一次 L1 修订不触发全量重渲染 |
| M4 | HITL 正式化 + 端到端单入口 | 同上 | 挂起 24h 可恢复；人工编辑不被覆盖 |

**每阶段均可独立回退，不允许出现"迁移到一半无法回头"的状态。**

---

## 19. 未决问题（Open Questions）

| # | 问题 | 影响 | 建议决策时点 |
|---|---|---|---|
| Q1 | 是否允许同轮并行修订多个无依赖关系的 minor issue | 吞吐 vs 归因清晰度 | M2 结束后用数据决定 |
| Q2 | Critic 是否需要跨 episode 一致性锚点（同一批参考样本） | 分数可比性 | Goal 3.0 |
| Q3 | Retention Critic 在缺乏真实留存数据前的可信度 | 权重设置 | Goal 3.3b 前保守配权 |
| Q4 | `max_unfreeze` 是否应为 0（即完全禁止解冻） | 质量 vs 成本 | M3 后评估 |
| Q5 | 是否需要素材版权/来源合规节点 | 法务风险 | M3 前 |
| Q6 | 多平台适配（小红书竖版 vs YouTube Shorts）是否需分叉 visual_plan | 图拓扑 | M3 前 |

---

## 20. Goal 3.1 交付物与验收标准

### 20.1 交付物

```
docs/langgraph/
  architecture.md          ← 本文档
  contracts.md             ← §4 契约层（Artifact / Issue / Evaluation / Agent 接口）
  state-schema.md          ← §5，含完整 reducer 表与迁移策略
  node-mapping.md          ← §8.2 节点清单表（含 owner/幂等/成本档）
  routing-design.md        ← §9 归属矩阵 + 优先级 + 选择算法
  revision-policy.md       ← §10 接受判据 / 策略升级 / 预算
  freeze-protocol.md       ← §11 冻结与解冻
  checkpoint-design.md     ← §14 持久化与并发
  human-review-design.md   ← §13
  observability-spec.md    ← §15
  test-plan.md             ← §17
  migration-plan.md        ← §18
  adr/                     ← ADR-001 起
config/                    ← §16 全部配置文件（含默认值）
spikes/graph_stub/         ← 纯 stub 的可运行图骨架
```

### 20.2 验收标准（全部可检查，替换 v0.1 的形容词）

- [ ] §3 角色表中每个 Agent 在 node-mapping 中有且仅有一个映射；Oral Judge 处置有 ADR。
- [ ] Visual Director 位置在全文档所有图与表中一致（内容循环末端、冻结前）。
- [ ] `Category` 枚举中每个值在 ownership 矩阵中映射到**恰好一个** owner；配置文件可被脚本校验。
- [ ] `ProductionState` 每个字段都有 reducer 声明与并发安全说明；无字段缺失。
- [ ] Reducer 属性测试（交换律 + 幂等）全部通过。
- [ ] 依赖 DAG 完整，每个 artifact 的 `depends_on` 已定义。
- [ ] 冻结前置条件、解冻触发条件、L1–L4 分级表均已量化，无"视情况而定"。
- [ ] 接受判据、策略升级、停滞检测的全部阈值出现在配置文件中，代码中无魔法数字。
- [ ] `spikes/graph_stub` 可编译并跑通：happy path、3 条修订路径（fact/hook/visual）、1 条升级人工路径、1 条解冻路径。
- [ ] Replay 测试：在 stub 图任意节点后中断并恢复，最终 state 等价且无重复 append。
- [ ] 12 份文档交叉引用无矛盾（由 reviewer 逐条核对 A2 中列出的 7 处矛盾已消除）。
- [ ] Open Questions 全部登记且有决策时点，无隐性悬置。

---

## 21. 风险登记

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| Critic 打分与真实观众行为不相关 | 高 | **致命**——自动修订在优化噪声 | Goal 3.0 黄金集校准；Goal 3.3b 用真实留存校准 rubric |
| 修订循环震荡不收敛 | 中 | 高 | 接受判据 + best-of + 策略升级 + 停滞升级人工 |
| LangGraph API 破坏性升级 | 中 | 中 | 锁版本 + `lg_compat.py` 单点封装 |
| State 膨胀导致 checkpoint 性能退化 | 中 | 中 | P1 强制；CI 加 checkpoint 体积断言 |
| 自动化后同质化（都用同一套高分套路） | 中 | 中 | Goal 3.3 保留探索性变体比例；监控开场类型分布 |
| 迁移期双轨维护成本 | 高 | 中 | 影子模式限时；M2 后即弃用手工路径 |

---

## 22. 后续阶段

```
Goal 3.0  Contract Hardening      ← 前置，决定 3.1/3.2 是否成立
   ↓
Goal 3.1  Architecture Design     ← 本文档
   ↓
Goal 3.2  LangGraph Implementation
   ↓
Goal 3.3a 内环优化（issue 频次统计 → prompt 改进 / 经验检索库）
Goal 3.3b 外环优化（发布后真实留存数据 → rubric 权重校准）
```

> **Goal 3.3 的红线**：在接入真实发布数据之前，禁止用 Critic 分数作为学习目标。否则系统只会学会"如何取悦自己的评分器"，形成自我强化的回音室，而与真实观众留存脱钩。

---

**文档结束｜v0.2**