# 0002 — 仓库结构收敛：现行路径、历史兼容与六项迁移

状态：Proposed

范围：落实结构评审中的 1～6 条。本文件是实施方案，不是代码变更本身。
约束：事实、来源、评审记录仍是 source of truth；不手修成片；不改写已绑定
SHA-256 的历史评审正文；路径变更不得让未知 episode 再静默落到 Poke。

## 一句话目标

`content/` 只放当期期次，`src/` 只放代码，新集只走 `MediaMixVertical`，大体积
媒体字节退出 git，文档和 `src/lib` 按职责分家。历史 001–003 与 Goal 3 对比包
继续可读、可回放，但不再当现行结构。

## 非目标

- 不把 001/002/003 重渲成 MediaMix。冻结即可，迁移是后续产品任务。
- 不物理搬迁 `content/episode-00N/v2-goal3/`。该路径已是 legacy 包的 canonical
  identity，搬迁会改写全部 `ArtifactRef.path`。
- 不重写历史 `delivery-critic-report.md` / `comparison-report.md` 里的旧路径。
  那些报告是当时的 hash 快照。
- 不引入自建对象存储服务。字节离库后用本地 restore + SHA-256 校验。
- 不把 LangGraph 变成默认生产入口。

## 目标终态

```text
content/
  README.md                          期次分类（active / evaluation / fixture）
  episode-001/                       现行 Poke（legacy renderer）
    research/ story/ production/
    v2-goal3/                        仍留在原地，只作 legacy 包
  episode-002/                       同上
  episode-003/                       Manus（legacy renderer，可后续再迁）
  episode-004/                       MediaMix
  episode-005/                       MediaMix

src/                                 只有 .ts / .tsx；无 *.generated.json
  compositions/
    MediaMixEpisode.tsx              唯一现行渲染器
    legacy/                          001–003 冻结，禁止新增
  lib/
    episode/  editorial/  delivery/  render/  platform/
  media/
  orchestration/
  schemas/

public/episodes/<id>/                Remotion staticFile 运行时副本
output/<id>/                         本地成片；git 不跟踪 mp4
downloads/                           已 ignore 的原始下载暂存

docs/
  contracts/                         现行规范
  milestones/                        M1–M5 验收
  archive/                           Goal 3.x 工作稿、过期设计
  decisions/                         决策记录（本文件留在这里）

tests/
  fixtures/                          测试自建临时仓；不放完整媒体期次
  lib/  media/  orchestration/       与 src 对齐
```

`episode-m5e2e` 的物理路径第一期不改（见第 4 条），用 `kind: "fixture"` 从
`content/` 的“产品目录”里逻辑剔除。

---

## 0. 横切约定（六条共用）

### 0.1 路径即身份

`ArtifactRef.path` 是身份的一部分。改路径 = 新引用，即使 SHA-256 相同。

| 动作                                            | 是否允许                             |
| ----------------------------------------------- | ------------------------------------ |
| 新写入改到新规范路径                            | 允许，记新 revision / 新 selected    |
| 历史报告里的旧路径字符串                        | 原样保留                             |
| 把已登记媒体从 `content/.../media/assets/` 挪走 | 禁止（第 3 条只 untrack，不改 path） |
| 给未知 episode 加 fallback composition          | 禁止                                 |

### 0.2 生成物双写窗口

第 2 条落地时允许一个 PR 周期的双写：规范路径必写，旧 `src/*-*.generated.json`
可继续写。下一 PR 删双写和 `src` 根上的 JSON。禁止无限期双写。

### 0.3 验收命令（每个 PR 至少跑）

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
EPISODE_ID=episode-001 pnpm validate:research
EPISODE_ID=episode-001 pnpm validate:story
EPISODE_ID=episode-001 pnpm validate:content
EPISODE_ID=episode-005 pnpm validate:research
EPISODE_ID=episode-005 pnpm validate:story
EPISODE_ID=episode-005 pnpm validate:content
```

涉及渲染契约或生成物路径的 PR，再加：

```bash
EPISODE_ID=episode-001 pnpm timeline   # 不调用 TTS；只确认写出位置
EPISODE_ID=episode-005 pnpm timeline
```

不在结构 PR 里跑真实 TTS、完整竖版渲染或 Delivery 复审。历史 MP4 不因搬目录
自动续期。

### 0.4 推荐落地顺序

```text
PR-A  第 1 条  冻结渲染器（小，锁政策）
PR-B  第 5 条  拆 docs（无运行时风险，可与 A 并行）
PR-C  第 2 条  生成物离开 src/
PR-D  第 4 条  别名解析 + 期次分类（可与 C 并行，勿与 C 改同一批 path helper）
PR-E  第 3 条  大文件离库 + restore
PR-F  第 6 条  拆 src/lib（最后做，避免和 C 抢同一批 import）
```

不要把 A–F 塞进一个 PR。

---

## 1. 冻结手写 Composition

### 问题

新集如果再加 `XxxEpisode.tsx`，产品和版式会继续写进 React。004/005 已经证明
`MediaMixVertical` + `media-render-plan-v1` 才是现行模型。

### 决策

- **现行 renderer**：`media-mix` → 唯一 composition `MediaMixVertical`。
- **冻结 renderer**：`legacy-composition` → 仅 `episode-001` / `002` / `003`。
- 注册新 episode 时，若 `renderer !== "media-mix"`，`getRenderContract` 直接抛错。
- 003 继续用 `ManusEpisode`，不在本方案重写成 MediaMix。

### 契约改动

`src/lib/render-contract.ts`（PR-F 后再随文件搬家）扩成：

```ts
export type RendererKind = "media-mix" | "legacy-composition";

export type RenderContract = {
  renderer: RendererKind;
  composition: string;
  smokeComposition: string;
  layoutVariant: LayoutVariant;
};

const renderContracts: Readonly<Record<string, RenderContract>> = {
  "episode-001": {
    renderer: "legacy-composition",
    composition: "PokeVertical",
    smokeComposition: "PokeVerticalSmoke",
    layoutVariant: "poke-standard",
  },
  "episode-002": {
    renderer: "legacy-composition",
    composition: "RoostVertical",
    smokeComposition: "RoostVerticalSmoke",
    layoutVariant: "roost-standard",
  },
  "episode-003": {
    renderer: "legacy-composition",
    composition: "ManusVertical",
    smokeComposition: "ManusVerticalSmoke",
    layoutVariant: "poke-standard",
  },
  "episode-004": mediaMix("poke-standard"),
  "episode-005": mediaMix("poke-standard"),
  "episode-m5e2e": mediaMix("poke-standard"),
};

const mediaMix = (layoutVariant: LayoutVariant): RenderContract => ({
  renderer: "media-mix",
  composition: "MediaMixVertical",
  smokeComposition: "MediaMixVertical",
  layoutVariant,
});

export const registerRenderContract = (episodeId: string, contract: RenderContract) => {
  if (contract.renderer !== "media-mix") {
    throw new Error(`新 episode 只能注册 media-mix：${episodeId}`);
  }
  // 仅测试 / 引导脚本使用；生产表是静态常量
};
```

删除 `generatedPrefix`。生成物路径不再按产品名拼接（见第 2 条）。

`layoutVariant` 枚举值 **不改名**。`poke-standard` / `roost-standard` /
`roost-goal3` 已经写进现有 `timeline.json`，改名会让全部时间轴校验失败。在
schema 旁加注释：这是冻结的视觉族名字，不是产品目录。新集一律写
`poke-standard` 或后续新增 `media-mix`（只有新集、且与 MediaMix 同时发版时才加）。

### 目录改动

```text
src/compositions/PokeEpisode.tsx      → src/compositions/legacy/PokeEpisode.tsx
src/compositions/RoostEpisode.tsx     → src/compositions/legacy/RoostEpisode.tsx
src/compositions/ManusEpisode.tsx     → src/compositions/legacy/ManusEpisode.tsx
src/compositions/shared.tsx           留在原处（MediaMix 和 legacy 共用）
src/compositions/MediaMixEpisode.tsx  留在原处
src/lib/poke-sound-design.ts          → src/compositions/legacy/poke-sound-design.ts
src/components/                       删除空目录
src/scenes/                           删除空目录
```

`src/Root.tsx` 继续注册六套 Composition（三套正式 + 三套 smoke + 封面 +
MediaMix）。Studio 里能打开 001–003，但不作为新集模板。

封面 `PokeCover3x4` / `RoostCover3x4` 一并迁入 `legacy/`。它们不是成片路径。

### 门禁

新增 `tests/render-contract.test.ts` 断言：

1. `episode-004` / `005` / `m5e2e` 的 `renderer === "media-mix"`。
2. `episode-006` 未注册时 fail-closed（已有）。
3. `src/compositions/*.tsx` 只允许 `MediaMixEpisode.tsx` 和 `shared.tsx`；
   其它 Composition 必须在 `legacy/`。用目录扫描测试锁住。
4. `src/lib/` 不得再出现 `poke-` / `roost-` 产品文件名。

### 文档

- `README.md`「Current execution boundary」加一小节：新集只走 MediaMix。
- `agents/visual-director.md` 写明 004 起输出 `media/shots` + render-plan，
  不再为新产品写 React 场景。
- `docs/m5-08-media-remotion.md` 标成现行渲染规范。

### 验收

- 001/002/003 的 composition id 不变，现有 `pnpm render:smoke` 命令行参数不用改。
- 新增扫描测试在把 Composition 放回 `src/compositions/` 根目录时失败。

---

## 2. 生成物离开 `src/`

### 问题

`src/` 根上现有 14 个 `*.generated.json`（含指向 v2-goal3 的符号链接）。
`build-timeline` 把同一份时间轴写了两遍：

- 真源：`content/<ep>/production/timeline.json`
- 副本：`src/<prefix>-timeline.generated.json`

MediaMix 已经从 `public/episodes/<ep>/media/{timeline,captions,render-plan}.json`
读取。`src/` 副本对 004+ 是第三份。

### 决策

| 角色                   | 路径                                                            |
| ---------------------- | --------------------------------------------------------------- |
| 时间轴真源             | `content/<ep>/production/timeline.json`（已存在，不改）         |
| 字幕 JSON 真源         | `content/<ep>/production/captions.generated.json`（新规范路径） |
| Remotion 运行时        | `public/episodes/<ep>/media/timeline.json`                      |
|                        | `public/episodes/<ep>/media/captions.json`                      |
|                        | `public/episodes/<ep>/media/render-plan.json`（已有）           |
| `src/*.generated.json` | 删除                                                            |

`generatedTimelinePath(episodeId)` 改为：

```ts
`content/${episodeId}/production/timeline.json`;
```

`generatedCaptionsPath(episodeId)` 改为：

```ts
`content/${episodeId}/production/captions.generated.json`;
```

不再经过 `generatedPrefix`。`poke-captions.generated.json` 这种特例消失。

### `build-timeline.ts` 新写出

1. `content/<ep>/production/timeline.json`（保持）
2. `content/<ep>/production/captions.generated.json`（新，替代 src 副本）
3. `public/episodes/<ep>/media/timeline.json`（与 MediaMix 对齐；001–003 也写）
4. `public/episodes/<ep>/media/captions.json`
5. `output/<ep>/subtitles_zh.srt`（保持）

过渡 PR 仍可同时写旧 `src/` 路径；删除 PR 去掉旧写入，并 `git rm` 那 14 个文件
和符号链接。

### Legacy Composition 怎么读数据

禁止 `import timeline from "../poke-timeline.generated.json"`。

001–003 改为与 MediaMix 相同的 metadata 加载：

```ts
// src/compositions/load-episode-render-data.ts  （browser-safe）
export const loadEpisodeRenderData = async (episodeId: string) => {
  const [timeline, captions] = await Promise.all([
    fetchJson(mediaRenderPublicFilePath(episodeId, "timeline.json")),
    fetchJson(mediaRenderPublicFilePath(episodeId, "captions.json")),
  ]);
  return {timeline, captions};
};
```

`Root.tsx` 里 `PokeVertical` / `RoostVertical` / `ManusVertical` 改用
`calculateMetadata`，按 `defaultProps.episodeId` 拉 public 副本，不再在模块顶层
import 生成 JSON。`durationInFrames` 来自 timeline，不再写死在 import 结果上。

`scripts/render.ts` 已有「content timeline 与 generated timeline 必须字节一致」
的检查。生成路径改成 content 真源后，这条检查变成「content timeline 存在且
episodeId / layout / audio 前缀匹配」。public 副本由 timeline 命令同步；render
前对 media-mix 继续走现有 `assertMediaMixReadyToRender`。

### 必须改的引用

| 文件                                                      | 改法                                                           |
| --------------------------------------------------------- | -------------------------------------------------------------- |
| `src/lib/render-contract.ts`                              | 路径函数改写；删 `generatedPrefix`                             |
| `scripts/build-timeline.ts`                               | 新写出集合                                                     |
| `scripts/render.ts`                                       | 读 content 真源                                                |
| `scripts/validate-content.ts`                             | 校验 content + public 副本一致                                 |
| `scripts/validate-delivery.ts`                            | `generatedCaptionsPath` 新值                                   |
| `src/media/render.ts`                                     | 同上                                                           |
| `src/orchestration/agents/adapters/deterministic-tool.ts` | timeline 阶段 outputs 改路径                                   |
| `src/Root.tsx`                                            | calculateMetadata                                              |
| `src/compositions/legacy/*Episode.tsx`                    | 去掉静态 JSON import                                           |
| `tests/render-contract.test.ts`                           | 期望路径更新                                                   |
| `tests/orchestration/production-adapters.test.ts`         | fixture 写入新路径                                             |
| `tests/media-remotion.test.ts`                            | 不再写 `src/episode-003-captions.generated.json`               |
| `reports/m5-acceptance/e2e-evidence.ts`                   | 读新 captions 路径                                             |
| `agents/delivery-critic.md`                               | 模板路径改成 `content/<ep>/production/captions.generated.json` |

### 明确不改

- 已提交的 `content/*/production/delivery-critic-report.md` 里出现的
  `src/poke-captions.generated.json` 等旧表行：保留。它们绑定的是当时的 SHA-256。
- `output/episode-001/iterations/**` 基线包：不动。
- 不把 `content/**/research/*.json` import 进 Remotion bundle。claims/sources
  继续只给 Node 侧 validator 和（若仍需要）legacy composition 的现有 import。
  若 PokeEpisode 仍 `import claims from "../../content/..."`，可维持；不要在
  结构 PR 里重做 Claim 加载。

### 验收

- `src/` 根目录不再有 `*.json`。
- `git grep -n 'src/.*generated.json'` 只命中历史 md 报告。
- `EPISODE_ID=episode-005 pnpm timeline` 不创建 `src/episode-005-*.json`。
- `getRenderContract("episode-001")` 不再含 `generatedPrefix`。

---

## 3. 媒体原片和成片退出 git

### 问题

跟踪体积约 349 MB。`content/` 209 MB（39 个媒体 mp4 + 379 张关键帧），`output/`
97 MB。`.gitignore` 只忽略 `output/episode-001/*.mp4`，003 以后的成片和全部
`media/assets` 都在 git 里。原片与 proxy 经常成对入库。

### 决策：path 不变，tracking 变

文件仍然落在现在的仓库相对路径上，校验和 `ArtifactRef` 继续指向这些路径。
git 不再保存大字节。clone 之后必须 `restore`，用 SHA-256 对齐清单。

### 继续跟踪

| 类型                               | 原因                                      |
| ---------------------------------- | ----------------------------------------- |
| 全部 `*.json` / `*.md` / `*.jsonl` | 身份、清单、评审、计划                    |
| `media/indexes/**/*.jpg` 关键帧    | 体积小，评审和检索需要                    |
| 001 对比基线包（见下）             | `validate:comparison` 绑定绝对路径 + hash |

001 对比基线是例外，必须留在 git（或 Git LFS）里，否则
`content/episode-001/production/comparison-report.md` 无法在 CI 复核：

```text
output/episode-001/iterations/baseline-2026-07-30/**
output/episode-001/iterations/publish-v2-2026-07-30/**
```

其它 output mp4 / smoke / 抽帧 png 全部离库。

### 停止跟踪（path 保留在 ignore 规则里）

```gitignore
# 成片与过程视频（001 对比基线除外）
output/**/*.mp4
output/**/*.wav
output/**/*.png
output/**/*.jpg
!output/episode-001/iterations/**/*.mp4
!output/episode-001/iterations/**/*.png
!output/episode-001/iterations/**/*.jpg

# 媒体原片、长 proxy、核验切片、render cut
content/**/media/assets/*.mp4
content/**/media/assets/*.mov
content/**/media/assets/*.webm
content/**/media/verifications/**/*-clip.mp4
content/**/media/render/*.mp4

# Remotion 运行时媒体副本（JSON 仍跟踪）
public/episodes/**/media/*.mp4
public/episodes/**/media/*.webm
public/episodes/*/audio/*.mp3
public/episodes/*/audio/*.wav

# 嵌在 v2-goal3 包里的成片与 TTS
content/**/v2-goal3/production/output/**
content/**/v2-goal3/production/public/**
```

`downloads/` 已 ignore，保持。

关键帧 jpg 仍跟踪。若日后单集关键帧超过 50 MB，再单独改成「只留 contact sheet」。

### 离库操作（一次性）

```bash
git rm --cached -- \
  output/episode-002/*.mp4 \
  output/episode-003/*.mp4 \
  output/episode-004/*.mp4 \
  output/episode-005/*.mp4 \
  output/episode-m5e2e/*.mp4 \
  content/*/media/assets/*.mp4 \
  content/*/media/verifications/**/*-clip.mp4 \
  content/*/media/render/*.mp4 \
  content/*/v2-goal3/production/output/*.mp4
# 工作区文件留下，只取消跟踪
```

提交信息写明：字节仍按原 path 存在本机；身份未变。

### Restore 合同

新增 `scripts/restore-media.ts`，`package.json` 加 `pnpm media:restore`。

行为：

1. 读 `content/<ep>/media/source-manifest.json` 与 `artifact-index.json`。
2. 对每个 `MediaAsset` / render proxy / verification clip：若本地缺失或
   SHA-256 不符，按顺序找：
   - `downloads/` 下同 hash 或同文件名
   - 环境变量 `MEDIA_STORE_DIR` 指向的目录（`<sha256>` 或 `<sha256>.<ext>`）
   - manifest 里仍有效的官方 URL（只用于 source 原片；失败则报缺，不静默跳过）
3. 写回 **原规范 path**，写完再 hash。不匹配则 fail-closed。
4. 不改 manifest，不改 artifact-index。

没有 `MEDIA_STORE_DIR`、也没有 `downloads/` 命中时，命令列出缺失清单并
exit 1。CI 默认不跑 restore，也不跑需要原片的渲染。

把现有本机 `downloads/` + 已有 assets 做成一键校验：

```bash
pnpm media:restore -- --episode episode-004 --verify-only
```

`--verify-only` 只核对在场文件的 hash，不下载。

### CI

`.github/workflows/ci.yml` 保持现在的离线契约检查（001/002 的 research / story
/ content）。不要在 CI 里假设 mp4 存在。若某条 `validate:content` 因缺少
public 媒体副本失败，把它改成：无 mp4 时跳过渲染相关断言，但 JSON 清单和 hash
字段仍必须合法。缺字节不能被当成清单合法。

### 体积预期

按当前跟踪文件，去掉 output 成片与 content 媒体 mp4 后，仓库应降到大约
**50–80 MB**（剩关键帧 jpg + 001 基线 + 文稿）。关键帧约 30 MB 的
`reports/visual-qa` 不在本条范围；若要再瘦，另开 PR 把 `reports/visual-qa/*.png`
改成 ignore 或 LFS。

### 验收

- 新 clone + `pnpm install` + `pnpm test` 仍绿。
- `git ls-files '*.mp4'` 只留下 001 `iterations/` 基线（以及若有意保留的极少数）。
- 本机有 downloads 时，`pnpm media:restore -- --episode episode-005` 能补齐
  `content/episode-005/media/assets/` 且 hash 与 manifest 一致。
- 未 restore 时 `pnpm render:vertical` 对 004/005 fail-closed，错误指向 restore。

---

## 4. 把 v2-goal3 和 m5e2e 从「当期 content」里拿出去

### 问题

`content/` 根上同时出现：

- 真期次目录
- `episode-001-v2-goal3` → `episode-001/v2-goal3` 符号链接
- 验收夹具 `episode-m5e2e`

`EPISODE_ID` 解析是 `content/${episodeId}`，所以这些别名看起来像可生产期次。

### 决策：逻辑分类，不改 canonical path

`content/episode-001/v2-goal3` 和 `content/episode-002/v2-goal3` **原地留下**。
`LEGACY_PACKAGE_SPECS` 已把它们定为 canonical。物理搬家等于给四套 legacy 包换
身份证，收益只是目录好看。

`episode-m5e2e` 第一期也 **原地留下**。它的 `mediaId` / `clipId` / 路径全部写死
在验收报告和 `artifact-index.json` 里。搬到 `tests/fixtures/` 是第二期可选项，
单独评估。

### 4.1 期次分类

`episode.config.json`（`episode-config-v2`）增加可选字段：

```ts
kind: z.enum(["episode", "benchmark", "fixture"]).default("episode");
```

| id                         | kind                                    |
| -------------------------- | --------------------------------------- |
| episode-001                | episode                                 |
| episode-002                | episode                                 |
| episode-003                | episode                                 |
| episode-004                | episode                                 |
| episode-005                | episode                                 |
| episode-001 的 v2-goal3 包 | benchmark（写在嵌套包自己的 config 上） |
| episode-002 的 v2-goal3 包 | benchmark                               |
| episode-m5e2e              | fixture                                 |

`kind` 缺省 = `episode`，旧 config 不用立刻改也能解析。

### 4.2 别名解析，删掉会骗人的符号链接

`src/lib/project.ts`（PR-F 后是 `src/lib/episode/paths.ts`）增加：

```ts
const EPISODE_ROOT_ALIASES: Readonly<Record<string, string>> = {
  "episode-001-v2-goal3": "content/episode-001/v2-goal3",
  "episode-002-v2-goal3": "content/episode-002/v2-goal3",
};

export const episodeContentRoot = (repoRoot: string, episodeId: string): string => {
  const relative = EPISODE_ROOT_ALIASES[episodeId] ?? `content/${episodeId}`;
  return path.join(repoRoot, relative);
};
```

`episodeRoot` / `publicEpisodeRoot` / `outputEpisodeRoot` 都走这个函数。
legacy importer 的 `aliases` 数组改为纯逻辑映射，不再要求文件系统符号链接存在。

然后删除：

```text
content/episode-001-v2-goal3
content/episode-002-v2-goal3
output/episode-001-v2-goal3
output/episode-002-v2-goal3
public/episodes/episode-001-v2-goal3
public/episodes/episode-002-v2-goal3
src/episode-001-v2-goal3-*.generated.json
src/episode-002-v2-goal3-*.generated.json
```

`EPISODE_ID=episode-001-v2-goal3` 仍然能解析到嵌套包，但 `getRenderContract`
对这个 id **不注册**。对它跑 `pnpm render` 必须 fail-closed。它只用于
legacy-import 和只读对照，不是可渲染 episode。

### 4.3 `content/README.md`

写明：

- 本目录只列产品期次与一个验收夹具。
- `v2-goal3/` 是 Goal 3 对比实验包，不要当作新集模板。
- `episode-m5e2e` 是 M5 验收夹具，禁止发布。
- 新集目录名必须是 `episode-<number>` 或经 render-contract 注册的 id。

### 4.4 测试与 CI

- `legacy-backfill.test.ts`：断言无符号链接时，alias id 仍解析到 canonical。
- 新增扫描：`content/` 根下不得再出现符号链接。
- CI 的离线校验列表保持 `episode-001` `episode-002`；不要加 m5e2e。

### 4.5 第二期（可选，不在本方案默认范围）

若仍要把 `episode-m5e2e` 挪到 `tests/fixtures/episodes/episode-m5e2e`：

1. 写一次性 path rewriter，只改该集 `artifact-index.json`、media JSON、测试、
   `reports/m5-acceptance/*`。
2. `episodeContentRoot` 增加 fixture 映射。
3. **不改** 媒体文件内部的 `episodeId` 字符串（`episode-m5e2e:media:demo` 保持）。
4. 单独 PR，单独验收 `reports/m5-acceptance` 脚本。

在 rewriter 和回放报告都准备好之前，不要搬。

### 验收

- `ls content` 只看到 `README.md` 和 `episode-*` 真目录，没有 symlink。
- `EPISODE_ID=episode-001-v2-goal3 pnpm validate:research` 仍能读到嵌套包。
- `EPISODE_ID=episode-001-v2-goal3 pnpm render:vertical` 抛「未注册渲染契约」。
- `importLegacyPackages` 的四包 hash 与搬迁前一致。

---

## 5. 拆 `docs/` 并修正角色说明

### 问题

37 个文件平铺。契约、里程碑验收、Goal 3 工作稿混在一起。
`agents/README.md` 仍写「不引入 LangGraph」，和 `src/orchestration/` 矛盾。

### 目标树

```text
docs/
  README.md                          索引：先读哪几份
  contracts/                         现行规范（代码冲突时以这里为准）
    agent-contract.md
    artifact-contract.md
    critic-output-schema.md
    evaluation-rubric.md
    routing-policy.md
    revision-policy.md
    observability-spec.md
    failure-modes.md
    test-plan.md
    editorial-policy.md
    human-decision.md
    production-adapters.md
    checkpoint-persistence.md
  milestones/
    m1-acceptance-report.md
    m2-acceptance-report.md
    m4-acceptance-report.md
    m4-02-failure-replay.md
    m4-05-legacy-backfill.md
    m4-06-concurrency.md
    m5-acceptance-report.md
    m5-01-media-contract.md
    m5-02-media-discovery.md
    m5-03-media-ingest.md
    m5-04-media-index.md
    m5-05-media-retrieval.md
    m5-06-media-verification.md
    m5-07-visual-director-selection.md
    m5-08-media-remotion.md
    m5-real-media-plan.md
  archive/
    goal-3.1.5-implementation-readiness.md
    goal-3.2-baseline-analysis.md
    goal-3.2-review-package.md
    ProductionAgent_Goal_3.1_LangGraph_架构设计文档_v0.2.md
    episode-001-demo-retrospective.md
    langgraph/                       实施计划与追溯矩阵（已落地，改归档）
  decisions/
    0001-spoken-rewrite-and-model-boundaries.md
    0002-structure-migration.md      本文件
```

`docs/technical-debt-backlog.md` 放到 `docs/contracts/` 或根索引里链过去，标成
「已关闭项的维护记录，不代表当前媒体验收」。

### 链接迁移

`git mv`，不要复制。然后全库替换相对链接：

```bash
git grep -n 'docs/agent-contract\|docs/artifact-contract\|docs/m5-'
```

必须改的常见入口：`README.md`、`AGENTS.md`、`docs/agent-contract.md` 内部互链、
`src/orchestration/**` 文件头注释、各 `docs/m5-*.md` 的 Parent 行。

加 `docs/README.md`，开头三行写：

1. 编辑政策与角色：`agents/README.md` + `contracts/editorial-policy.md`
2. 产物身份：`contracts/artifact-contract.md`
3. 现行渲染：`milestones/m5-08-media-remotion.md`

### `agents/README.md` 修正

把「不引入 LangGraph、AutoGen 或 CrewAI」改成：

```text
角色之间的正式交接仍是文件，不是聊天记录，也不是 LangGraph state。
`src/orchestration/` 是 opt-in 控制面：默认 ORCHESTRATOR=manual，分阶段命令
仍是生产入口。编排层只保存 ArtifactRef，禁止把研究包或脚本正文写入 checkpoint。
本项目继续排除自部署 GPT、LLM 和语音模型。
```

角色列表、状态流、口播门禁保持不变。

### 验收

- 仓库内没有断链：`git grep -n '](docs/[^)]*'` 指向的文件都存在。
- `agents/README.md` 不再声称「不引入 LangGraph」。
- 现行契约仍在 `docs/contracts/`，验收报告不冒充现行规范。

---

## 6. 拆 `src/lib/`

### 问题

21 个文件共约 3900 行，生产契约、口播、TTS、工作流、001 音效混在一层。
`scripts/` 和 `tests/` 从扁平路径 import，搬家会有机械变更，但边界必须先定死。

### 目标模块

```text
src/lib/
  episode/                 路径、CLI、episode config、生产契约、渲染契约
    paths.ts               现 project.ts（含第 4 条 alias）
    cli.ts
    production-contract.ts
    render-contract.ts
    workflow.ts
  editorial/               文本规则、稿件、polish、评分辅助
    text-rules.ts          现 editorial-text-rules.ts
    pipeline-config.ts     现 pipeline-v2-config.ts
    polish.ts
    story.ts
    story-quality.ts
    llm.ts
  delivery/                TTS、字幕、成片读回、对比
    tts-providers.ts
    captions.ts
    delivery.ts
    comparison.ts
    capture-assets.ts
    scene-animation.ts
  platform/                与业务无关的运行时
    network.ts
    process.ts
    cache.ts               现 fine-grained-cache.ts
  index.ts                 可选；不强制所有人走桶文件
```

单集代码不进 lib：`poke-sound-design.ts` 在第 1 条已迁到 `compositions/legacy/`。

### Import 策略

**一次改完，不留永久 re-export。** 在 `src/lib/polish.ts` 放一层
`export * from "./editorial/polish"` 只会再制造双轨。

做法：

1. `git mv` 文件到新目录，必要时改文件名。
2. 全库更新 import。入口大约 40 个文件（`scripts/*`、`tests/*`、
   `src/orchestration/**`、`src/media/render.ts`）。
3. 用 `git grep 'src/lib/project' 'src/lib/polish' 'src/lib/tts-providers'`
   确认旧路径清零。
4. `tests/` 同步分目录，避免 lib 清了测试还平铺：

```text
tests/lib/episode/
tests/lib/editorial/
tests/lib/delivery/
tests/media/           现有 media-*.test.ts 移入
tests/orchestration/   已存在
tests/scripts/         已存在
```

测试搬家是同一 PR 或紧随的 PR-F2。不要把测试搬家和逻辑改动混在一起。

### `repoRoot` 计算

`project.ts` 现在是 `path.resolve(import.meta.dirname, "../..")`。搬到
`src/lib/episode/paths.ts` 后必须改成 `../../../`。加一个单测：
`repoRoot` 下存在 `package.json` 且 name 为 `product-story-video-lab`。

### 验收

- `src/lib/` 第一层只有四个子目录，没有散落的业务 `.ts`。
- `pnpm typecheck` 与 `pnpm test` 全绿。
- 没有任何文件从 `src/lib/*.ts` 旧路径 import。

---

## 风险与回滚

| 风险                                                               | 处理                                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| 改 generated 路径后，旧 Delivery 报告里的表路径对不上新文件        | 不改历史报告。新评审写新路径。validator 读现行 `generatedCaptionsPath()`        |
| untrack mp4 后 CI 或同事 clone 无法渲染                            | CI 本就不渲。文档写明 `pnpm media:restore`。render 缺字节 fail-closed           |
| 删除 v2-goal3 符号链接后有人手动 `EPISODE_ID=episode-001-v2-goal3` | alias 解析保留只读；render-contract 不注册                                      |
| lib 搬家漏改 import                                                | typecheck 挡；禁止兼容层                                                        |
| 误改 `ArtifactRef.path` 里的媒体路径                               | 第 3 条明确禁止；code review 检查清单含此项                                     |
| 001 对比基线被 ignore 误伤                                         | ignore 用 `!output/episode-001/iterations/**` 反选；PR-E 后 `git ls-files` 核对 |

每个 PR 可独立回滚。PR-E（untrack）回滚是 `git revert` 加回跟踪，工作区字节还在。

---

## 完成定义

六条全部落地后，下面全部为真：

1. 新集不能注册非 `media-mix` renderer；`src/compositions/` 根上没有新产品文件。
2. `src/` 根上没有 `*.generated.json`。
3. `git ls-files '*.mp4'` 只含 001 对比基线（或已声明的 LFS 基线）。
4. `content/` 根上没有 symlink；v2-goal3 仍在嵌套目录；m5e2e 标成 fixture。
5. `docs/contracts/` 是现行规范，`agents/README.md` 承认 opt-in LangGraph。
6. `src/lib/` 按 episode / editorial / delivery / platform 分家。

未完成但允许留下的债：001–003 仍是手写 Composition；m5e2e 仍在 `content/`；
`layoutVariant` 仍叫 `poke-standard`。这三项各自需要媒体重渲或路径改写，不在
本方案默认范围。
