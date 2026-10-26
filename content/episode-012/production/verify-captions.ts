import assert from "node:assert/strict";
import fs from "node:fs";
import {findCaptionSemanticBoundaryIssues} from "../../../src/lib/delivery/captions";
import {measureCaptionDelivery, parseSrt} from "../../../src/lib/delivery/delivery";
const root = "content/episode-012";
const script = JSON.parse(fs.readFileSync(`${root}/story/script.json`, "utf8"));
const captions = JSON.parse(fs.readFileSync(`${root}/production/captions.generated.json`, "utf8"));
for (const segment of script.segments) {
  const cues = captions.filter((c: any) => c.sceneId === segment.id).map((c: any) => c.text);
  assert.deepEqual(findCaptionSemanticBoundaryIssues(segment.narration, cues), [], segment.id);
}
const metrics = measureCaptionDelivery(
  parseSrt(fs.readFileSync("output/episode-012/subtitles_zh.srt", "utf8")),
  1,
);
assert.ok(metrics.microCueRatio <= 0.1);
console.log(JSON.stringify(metrics));
