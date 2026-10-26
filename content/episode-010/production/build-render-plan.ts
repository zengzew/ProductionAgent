import fs from 'node:fs';
import {selectVisualSlotForSegment} from '../../../src/media/select';
import {buildMediaRenderPlanForTimeline,assertMediaRenderPlanRenderable} from '../../../src/media/render';
import {buildMediaRenderManifest,assertMediaRenderManifestConsistent} from '../../../src/media/projection';
const repoRoot=process.cwd(),episodeId='episode-010',root=`content/${episodeId}`;
const script=JSON.parse(fs.readFileSync(`${root}/story/script.json`,'utf8'));
const timeline=JSON.parse(fs.readFileSync(`${root}/production/timeline.json`,'utf8'));
const entries=JSON.parse(fs.readFileSync(`${root}/media/observations.json`,'utf8'));
for(const entry of entries){const seg=script.segments.find((s:any)=>s.id===entry.segmentId),scene=timeline.scenes.find((s:any)=>s.id===seg.id);const result=await selectVisualSlotForSegment({repoRoot,episodeId,segment:{segmentId:seg.id,claimIds:seg.claimIds,narration:seg.narration,visualIntent:seg.visualIntent,durationTargetMs:Math.round(scene.durationFrames/30*1000)}});if(result.selectedType!=='real-media')throw new Error(`Expected checked real media ${seg.id}`);}
const labels:Record<string,string>={
'seg-001':'Granola官网 · 2024年产品演示 · 非本次实测',
'seg-002':'官网创始人照片＋真实页面局部 · 2024-05-22',
'seg-003':'Granola官网原图 · 2024-05-22 · 中文为编辑释义',
'seg-004':'Granola官网 · 2024年产品演示 · 非本次实测',
'seg-005':'Granola官网演示结果 · 局部停帧供阅读',
'seg-006':'Granola真实页面局部 · 2024-10-23 · 公司自述',
'seg-007':'Granola真实页面局部 · 2024-10-23 · 公司自述',
'seg-008':'Granola真实页面局部 · 2026-03-25 · 公司披露',
'seg-009':'Granola官网原图 · 黑色手记／灰色AI补全 · 编辑释义',
};
const overlaysBySegment=Object.fromEntries(Object.entries(labels).map(([id,sourceLabel])=>[id,{sourceLabel,badge:null}]));
const plan=buildMediaRenderPlanForTimeline({repoRoot,episodeId,audio:{originalAudioGain:0,narrationGain:1},fade:{inMs:0,outMs:0},crossfadeMs:0,overlaysBySegment});
assertMediaRenderPlanRenderable({repoRoot,episodeId});const projection=buildMediaRenderManifest({repoRoot,episodeId});assertMediaRenderManifestConsistent({repoRoot,episodeId});console.log(JSON.stringify({seconds:plan.totalSeconds,shots:plan.shots.map(s=>({id:s.segmentId,type:s.visualType})),projection:projection.artifactRef.sha256}));
