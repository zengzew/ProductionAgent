import fs from 'node:fs';
import {selectVisualSlotForSegment} from '../../../src/media/select';
import {buildMediaRenderPlanForTimeline,assertMediaRenderPlanRenderable} from '../../../src/media/render';
import {buildMediaRenderManifest,assertMediaRenderManifestConsistent} from '../../../src/media/projection';
const repoRoot=process.cwd(),episodeId='episode-011',root=`content/${episodeId}`;
const script=JSON.parse(fs.readFileSync(`${root}/story/script.json`,'utf8'));
const timeline=JSON.parse(fs.readFileSync(`${root}/production/timeline.json`,'utf8'));
const entries=JSON.parse(fs.readFileSync(`${root}/media/observations.json`,'utf8'));
for(const entry of entries){const seg=script.segments.find((s:any)=>s.id===entry.segmentId),scene=timeline.scenes.find((s:any)=>s.id===seg.id);const result=await selectVisualSlotForSegment({repoRoot,episodeId,segment:{segmentId:seg.id,claimIds:seg.claimIds,narration:seg.narration,visualIntent:seg.visualIntent,durationTargetMs:Math.round(scene.durationFrames/30*1000)}});if(result.selectedType!=='real-media')throw new Error(`Expected checked real media ${seg.id}`);}
const labels:Record<string,string>={
'seg-001':'Gamma官网演示结果＋教程说明 · 非本次生成实录',
'seg-002':'Stanford STVP · 2025-10-21 · 创始人回忆',
'seg-003':'官方图示＋访谈摘录 · 编辑释义 · 非早期原型',
'seg-004':'Gamma官方教程＋演示结果 · 编辑说明 · 非实测',
'seg-005':'Gamma官网 · 2025官方演示 · 示例数字非Gamma数据',
'seg-006':'Grant Lee 本人历史回顾 · 原文短摘录 · 编辑排版',
'seg-007':'创始人历史自述＋官方结果 · 编辑说明',
'seg-010':'创始人历史回顾 · 注册量非留存率 · 编辑解释',
'seg-008':'公司口径 · ARR 2025-11-10／累计人数 2026-08-11',
'seg-009':'告别从零排版 · 官网历史演示 · 编辑观点',
};
const overlaysBySegment=Object.fromEntries(Object.entries(labels).map(([id,sourceLabel])=>[id,{sourceLabel,badge:null}]));
const plan=buildMediaRenderPlanForTimeline({repoRoot,episodeId,audio:{originalAudioGain:0,narrationGain:1},fade:{inMs:0,outMs:0},crossfadeMs:0,overlaysBySegment});
assertMediaRenderPlanRenderable({repoRoot,episodeId});const projection=buildMediaRenderManifest({repoRoot,episodeId});assertMediaRenderManifestConsistent({repoRoot,episodeId});console.log(JSON.stringify({seconds:plan.totalSeconds,shots:plan.shots.map(s=>({id:s.segmentId,type:s.visualType})),projection:projection.artifactRef.sha256}));
