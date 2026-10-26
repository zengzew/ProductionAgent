import fs from 'node:fs';
import {selectVisualSlotForSegment} from '../../../src/media/select';
import {buildMediaRenderPlanForTimeline,assertMediaRenderPlanRenderable} from '../../../src/media/render';
import {buildMediaRenderManifest,assertMediaRenderManifestConsistent} from '../../../src/media/projection';
const repoRoot=process.cwd(),episodeId='episode-009',root=`content/${episodeId}`;
const script=JSON.parse(fs.readFileSync(`${root}/story/script.json`,'utf8'));
const timeline=JSON.parse(fs.readFileSync(`${root}/production/timeline.json`,'utf8'));
const entries=JSON.parse(fs.readFileSync(`${root}/media/observations.json`,'utf8'));
for(const entry of entries){const seg=script.segments.find((s:any)=>s.id===entry.segmentId),scene=timeline.scenes.find((s:any)=>s.id===seg.id);const result=await selectVisualSlotForSegment({repoRoot,episodeId,segment:{segmentId:seg.id,claimIds:seg.claimIds,narration:seg.narration,visualIntent:seg.visualIntent,durationTargetMs:Math.round(scene.durationFrames/30*1000)}});if(result.selectedType!=='real-media')throw new Error(`Expected checked real media ${seg.id}`);}
const labels:Record<string,string>={
'seg-001':'Starter Story · 历史演示 · Cal AI 宣传候选',
'seg-002':'流程示意 · 据 Starter Story 创始人采访 · 非生成实录',
'seg-003':'Starter Story · Fastlane 历史界面演示',
'seg-004':'Starter Story · 历史演示节选 · 步骤省略 · 排期选项停帧',
'seg-005':'Gaurav Thapa · Fastlane 创始人 · Starter Story 采访',
'seg-006':'获客流程示意 · 据创始人介绍 · 非真实帖子/邮件截图',
'seg-007':'访谈机制示意 · 据创始人介绍 · 非当前试用规则',
'seg-008':'Starter Story · 创始人谈话 · 非客户通话录像',
'seg-009':'真实页面局部截图 · Starter Story · 2026-04-03 · 创始人自报',
'seg-010':'Starter Story · 历史演示节选 · 步骤省略 · 排期选项停帧',
};
const overlaysBySegment=Object.fromEntries(Object.entries(labels).map(([id,sourceLabel])=>[id,{sourceLabel,badge:null}]));
const plan=buildMediaRenderPlanForTimeline({repoRoot,episodeId,audio:{originalAudioGain:0,narrationGain:1},fade:{inMs:0,outMs:0},crossfadeMs:0,overlaysBySegment});
assertMediaRenderPlanRenderable({repoRoot,episodeId});const projection=buildMediaRenderManifest({repoRoot,episodeId});assertMediaRenderManifestConsistent({repoRoot,episodeId});console.log(JSON.stringify({seconds:plan.totalSeconds,shots:plan.shots.map(s=>({id:s.segmentId,type:s.visualType})),projection:projection.artifactRef.sha256}));
