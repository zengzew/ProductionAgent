import fs from 'node:fs';
import {selectVisualSlotForSegment} from '../../../src/media/select';
import {buildMediaRenderPlanForTimeline,assertMediaRenderPlanRenderable} from '../../../src/media/render';
import {buildMediaRenderManifest,assertMediaRenderManifestConsistent} from '../../../src/media/projection';
const repoRoot=process.cwd(),episodeId='episode-008';
const script=JSON.parse(fs.readFileSync(`content/${episodeId}/story/script.json`,'utf8'));
const timeline=JSON.parse(fs.readFileSync(`content/${episodeId}/production/timeline.json`,'utf8'));
for(const segment of script.segments.filter((s:{id:string})=>['seg-001','seg-002','seg-004'].includes(s.id))){
 const scene=timeline.scenes.find((s:{id:string})=>s.id===segment.id);
 const result=await selectVisualSlotForSegment({repoRoot,episodeId,segment:{segmentId:segment.id,claimIds:segment.claimIds,narration:segment.narration,visualIntent:segment.visualIntent,durationTargetMs:Math.round(scene.durationFrames/30*1000)}});
 if(result.selectedType!=='real-media')throw new Error(`Unexpected fallback for ${segment.id}`);
 console.log('selected',segment.id,result.selectedType);
}
const plan=buildMediaRenderPlanForTimeline({repoRoot,episodeId,audio:{originalAudioGain:0,narrationGain:1},fade:{inMs:0,outMs:0},crossfadeMs:80});
assertMediaRenderPlanRenderable({repoRoot,episodeId});
const projection=buildMediaRenderManifest({repoRoot,episodeId});assertMediaRenderManifestConsistent({repoRoot,episodeId});
console.log(JSON.stringify({totalSeconds:plan.totalSeconds,shots:plan.shots.map(s=>({segmentId:s.segmentId,type:s.visualType,media:s.lineage?.sourceMediaId})),projection:projection.artifactRef.sha256}));
