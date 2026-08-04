<!-- oral-review-gate
{
  "rubricVersion": "oral-review-v2",
  "promptVersion": "oral-judge-v2",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "b6e7a27d5406539463e7640cc5478da3807c3fe5337392db12c334eb5d03e7cf",
  "sourceDraftFile": "story/script-draft.md",
  "sourceDraftSha256": "6585fa6a8e18d0d247d779e58341581caf7efd06b925f419c47953301ddd9aae",
  "round": 1,
  "scores": {
    "chineseNaturalness": 3,
    "spokenDelivery": 4,
    "informationFidelity": 3
  },
  "minimumScore": 4,
  "checks": {
    "translatedSyntax": {
      "result": "FAIL",
      "evidence": [
        {
          "locator": "seg-008 / 原句：如果这套用法想发给朋友",
          "observation": "条件句主客体错位，字面上变成“这套用法”自己想发给朋友，听众需要回头补出动作主体；最小修改是补成“如果你想把这套用法发给朋友”。"
        }
      ]
    },
    "sourceAttributionLanguage": {
      "result": "PASS",
      "evidence": [
        {
          "locator": "seg-005 / 原句：用户的意思很直接，他们不想再学一套新界面",
          "observation": "用“用户”及其具体诉求承接创始人口述，没有把“访谈里”“独立体验者”等研究档案标签念进旁白。"
        },
        {
          "locator": "seg-003 / claim-poke-015 / 原句：Cognition 说",
          "observation": "消息量保留了披露主体 Cognition，来源身份没有被改写成独立验证。"
        }
      ]
    },
    "productStageLanguage": {
      "result": "PASS",
      "evidence": [
        {
          "locator": "seg-006 / claim-poke-008 / 原句：内测用户没有停在邮件上",
          "observation": "将 Beta users 处理为自然中文身份“内测用户”，没有生硬念成“Beta 用户”。"
        },
        {
          "locator": "seg-009 / claim-poke-004 / 原句：想用 Poke 已经不用再等候补",
          "observation": "把 general availability 转成用户可感知的准入变化，没有在旁白中念“进入一般可用状态”。"
        }
      ]
    },
    "turnDirection": {
      "result": "PASS",
      "evidence": [
        {
          "locator": "seg-003 / 原句：可它最早做的，只是一套邮件工作台",
          "observation": "“可”明确连接当前消息规模与早期邮件工作台之间的预期落差，方向清楚。"
        },
        {
          "locator": "seg-007 / 原句：Poke 不光等你发消息，它也会先来找你",
          "observation": "“不光……也……”明确从被动接收请求扩展到主动联系，没有把授权或核对步骤误写成褒贬转折。"
        }
      ]
    },
    "sentenceCadence": {
      "result": "PASS",
      "evidence": [
        {
          "locator": "seg-004 / 两句完整旁白",
          "observation": "第一句用连续动作展开流程，第二句缩短并补充复查后果，句长和结构有变化，不是连续海报短句。"
        },
        {
          "locator": "seg-007 / 四句完整旁白",
          "observation": "主动联系、具体提醒、授权后能力和最终核对依次推进，长短句错开，未用密集反问或口头禅伪装口语。"
        }
      ]
    },
    "spokenBreath": {
      "result": "PASS",
      "evidence": [
        {
          "locator": "seg-007 / 原句：你授权以后，它能读邮件、改日历，也能替你草拟回复。这些结果需要你最后核对。",
          "observation": "授权能力与核对责任由句号分开，单句只需一次自然换气，停顿与语义边界一致。"
        },
        {
          "locator": "seg-010 / 四句完整旁白",
          "observation": "结尾四个动作分别落句，按目标语速可逐句换气，最后停在已更新的日历状态。"
        }
      ]
    },
    "informationFidelity": {
      "result": "FAIL",
      "evidence": [
        {
          "locator": "seg-003 / claim-poke-015 / 原句：收购前大约三个月，Cognition 说，用户和 Poke 已经发了一亿多条消息",
          "observation": "普通中文会把“收购前大约三个月”听成 Cognition 的披露时点；Claim 与初稿表达的是截至收购时往前约三个月的消息统计窗口。最小修改是把时间移入消息范围，例如“Cognition 说，收购前的约三个月里……”。"
        },
        {
          "locator": "seg-008 / claim-poke-012 / 原句：轮到连接个人账户时，再由他自己确认授权",
          "observation": "Recipe 的分享动作与个人账户授权边界均与初稿和 Claim 一致，没有改成无条件一键完成。"
        },
        {
          "locator": "seg-010 / claim-poke-010, claim-poke-011 / 原句：日历上的会议已经在周三下午三点了",
          "observation": "结尾回到开场的功能演示和同一日历状态，没有新增真实用户个案、增长因果或未来判断。"
        }
      ]
    }
  },
  "styleSamples": [],
  "blockers": [
    "translatedSyntax: seg-008 的‘如果这套用法想发给朋友’主客体错位；最小修改为补出‘你想把’。",
    "informationFidelity: seg-003 的‘收购前大约三个月，Cognition 说’会把披露时点听成收购前三个月；最小修改为把约三个月明确为消息统计窗口。"
  ],
  "verdict": "REJECT",
  "returnTo": "oral-rewriter"
}
-->

# Oral Review · Round 1

结论：**REJECT**，退回 Oral Rewriter。

评分为中文自然度 3/5、口播节奏 4/5、信息保真 3/5。整体已经有自然对象感，产品阶段、来源称呼、授权边界和结尾动作也处理得清楚；但 `seg-008` 存在主客体错位，`seg-003` 又把约三个月的统计窗口放到了容易误读为披露时点的位置。两项分别触发 `translatedSyntax` 与 `informationFidelity` 硬门。

最小修改清单：

1. `seg-008` 将“如果这套用法想发给朋友”改为明确的“如果你想把这套用法发给朋友”。
2. `seg-003` 将约三个月明确写成消息统计窗口，不得让它修饰 Cognition 的披露动作；例如“Cognition 说，收购前的约三个月里，用户和 Poke 已经发了一亿多条消息”。

除以上两处外，本轮不要求改动其他旁白。
