import assert from 'node:assert/strict';
import fs from 'node:fs';
import {findCaptionSemanticBoundaryIssues} from '../../../src/lib/delivery/captions';
import {measureCaptionDelivery,parseSrt} from '../../../src/lib/delivery/delivery';
const root='content/episode-011';
const script=JSON.parse(fs.readFileSync(`${root}/story/script.json`,'utf8'));
const plan=JSON.parse(fs.readFileSync(`${root}/story/caption-plan.json`,'utf8'));
for(const segment of script.segments){
 const cues=plan.segments.find((p:any)=>p.segmentId===segment.id).cues;
 assert.deepEqual(findCaptionSemanticBoundaryIssues(segment.narration,cues),[],segment.id);
}
const metrics=measureCaptionDelivery(parseSrt(fs.readFileSync('output/episode-011/subtitles_zh.srt','utf8')),1);
assert.ok(metrics.microCueRatio<=.1);
console.log(JSON.stringify(metrics));
