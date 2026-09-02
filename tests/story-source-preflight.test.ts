import {describe, expect, it} from "vitest";
import {
  assessStorySourcePreflight,
  storySourcePreflightSchema,
  type StorySourcePreflight,
} from "../src/lib/editorial/story-source-preflight";

const criterion = (sourceIds: string[]) => ({
  status: "supported" as const,
  sourceIds,
  notes: "有可追溯证据",
});
const absent = {status: "not-applicable" as const, sourceIds: [], notes: "本 profile 不需要"};

const mechanismCandidate = storySourcePreflightSchema.parse({
  schemaVersion: "story-source-preflight-v2",
  candidateId: "mechanism-example",
  product: "Mechanism Example",
  asOf: "2026-09-01",
  sourceStrategy: "multi-source",
  storyProfiles: ["product-mechanism"],
  universalCriteria: {
    productOrEventClarity: criterion(["official"]),
    audienceQuestion: {...criterion(["official"]), text: "这个产品为什么故意让用户等待？"},
    storyMotion: criterion(["official", "user"]),
    factTraceability: criterion(["official", "platform"]),
    realVisualFeasibility: criterion(["official"]),
    rightsBoundaryRecorded: true,
  },
  sources: [
    {
      id: "official",
      title: "Official product demo",
      publisher: "Example",
      url: "https://example.com/product",
      sourceType: "official",
      roles: ["spine", "verification", "visual"],
      firstPerson: false,
      transcriptAvailable: false,
      supports: ["productMechanism", "userNeed"],
      mediaTypes: ["product-demo"],
      discoverable: true,
      rightsStatus: "review-required",
      rightsBoundary: "发布前复审",
    },
    {
      id: "user",
      title: "User examples",
      publisher: "Community",
      url: "https://example.com/users",
      sourceType: "user",
      roles: ["spine", "visual"],
      firstPerson: true,
      transcriptAvailable: false,
      supports: ["userBehavior"],
      mediaTypes: ["user-footage"],
      discoverable: true,
      rightsStatus: "review-required",
      rightsBoundary: "逐条确认用户素材",
    },
    {
      id: "platform",
      title: "Platform listing",
      publisher: "Platform",
      url: "https://example.com/platform",
      sourceType: "platform",
      roles: ["verification"],
      firstPerson: false,
      transcriptAvailable: false,
      supports: ["marketEvent"],
      mediaTypes: [],
      discoverable: true,
      rightsStatus: "not-applicable",
      rightsBoundary: "只用于事实核验",
    },
  ],
  storyEvidence: {
    protagonist: absent,
    userNeed: criterion(["official"]),
    productMechanism: criterion(["official"]),
    founderDecision: absent,
    buildFriction: absent,
    distribution: absent,
    marketEvent: absent,
    userBehavior: criterion(["user"]),
    measurableOutcome: absent,
    turningPoint: absent,
  },
  keyClaims: [],
  blockers: [],
  notes: "没有创始人采访、开发阻力或收入数据也可以通过。",
});

describe("story-source preflight v2", () => {
  it("admits a multi-source product-mechanism story without founder or revenue evidence", () => {
    const assessment = assessStorySourcePreflight(mechanismCandidate);
    expect(assessment.decision).toBe("ready");
    expect(assessment.scores.sourceCoherence).toBe(4);
  });

  it.each([
    {
      strategy: "primary-led" as const,
      profiles: ["product-mechanism" as const],
      mutate: (candidate: StorySourcePreflight): StorySourcePreflight => candidate,
    },
    {
      strategy: "event-led" as const,
      profiles: ["market-event" as const],
      mutate: (candidate: StorySourcePreflight): StorySourcePreflight => ({
        ...candidate,
        sources: candidate.sources.map((source) =>
          source.id === "platform" ? {...source, roles: ["spine", "verification"]} : source,
        ),
        storyEvidence: {
          ...candidate.storyEvidence,
          marketEvent: criterion(["platform"]),
        },
      }),
    },
    {
      strategy: "user-led" as const,
      profiles: ["user-behavior" as const],
      mutate: (candidate: StorySourcePreflight): StorySourcePreflight => candidate,
    },
  ])("admits the $strategy route when its own profile evidence exists", (example) => {
    const candidate = example.mutate({
      ...mechanismCandidate,
      sourceStrategy: example.strategy,
      storyProfiles: example.profiles,
    });
    expect(assessStorySourcePreflight(candidate).decision).toBe("ready");
  });

  it("routes an unclear product to more research instead of forcing a founder story", () => {
    const unclear: StorySourcePreflight = {
      ...mechanismCandidate,
      universalCriteria: {
        ...mechanismCandidate.universalCriteria,
        productOrEventClarity: {
          status: "partial",
          sourceIds: ["official"],
          notes: "只有品牌口号",
        },
      },
    };
    const assessment = assessStorySourcePreflight(unclear);
    expect(assessment.decision).toBe("research-more");
    expect(assessment.reasons).toContain("产品或事件没有解释清楚");
  });

  it("requires only the evidence selected by the story profile", () => {
    const wrongProfile: StorySourcePreflight = {
      ...mechanismCandidate,
      storyProfiles: ["founder-journey"],
    };
    const assessment = assessStorySourcePreflight(wrongProfile);
    expect(assessment.decision).toBe("research-more");
    expect(assessment.reasons.join(" ")).toMatch(/founder-journey/u);
  });

  it("rejects dangling source references", () => {
    const invalid: StorySourcePreflight = {
      ...mechanismCandidate,
      universalCriteria: {
        ...mechanismCandidate.universalCriteria,
        factTraceability: criterion(["missing"]),
      },
    };
    const assessment = assessStorySourcePreflight(invalid);
    expect(assessment.decision).not.toBe("ready");
    expect(assessment.reasons.join(" ")).toMatch(/missing/u);
  });

  it("does not accept evidence from a source that never declared support for it", () => {
    const invalid: StorySourcePreflight = {
      ...mechanismCandidate,
      storyEvidence: {
        ...mechanismCandidate.storyEvidence,
        productMechanism: criterion(["user"]),
      },
    };
    const assessment = assessStorySourcePreflight(invalid);
    expect(assessment.decision).toBe("research-more");
    expect(assessment.reasons).toContain("productMechanism 没有引用声明支持该证据的来源");
  });
});
