import fs from 'node:fs';
import {selectVisualSlotForSegment} from '../../../src/media/select';
import {buildMediaRenderPlanForTimeline,assertMediaRenderPlanRenderable} from '../../../src/media/render';
import {buildMediaRenderManifest,assertMediaRenderManifestConsistent} from '../../../src/media/projection';
const repoRoot=process.cwd(),episodeId='episode-009-v2',root=`content/${episodeId}`;
const script=JSON.parse(fs.readFileSync(`${root}/story/script.json`,'utf8'));
const timeline=JSON.parse(fs.readFileSync(`${root}/production/timeline.json`,'utf8'));
const entries=JSON.parse(fs.readFileSync(`${root}/media/observations.json`,'utf8'));
for(const entry of entries){const seg=script.segments.find((s:any)=>s.id===entry.segmentId),scene=timeline.scenes.find((s:any)=>s.id===seg.id);const result=await selectVisualSlotForSegment({repoRoot,episodeId,segment:{segmentId:seg.id,claimIds:seg.claimIds,narration:seg.narration,visualIntent:seg.visualIntent,durationTargetMs:Math.round(scene.durationFrames/30*1000)}});if(result.selectedType!=='real-media')throw new Error(`Expected checked real media ${seg.id}`);}
const labels:Record<string,string>={
'seg-001':'Starter Story · 历史产品演示 · Cal AI候选',
'seg-002':'Gaurav Thapa · Fastlane创始人 · 原采访',
'seg-003':'官网宣传动效＋历史候选 · 非本次生成实录',
'seg-004':'历史实演节选 · 步骤省略 · 排期选项停帧',
'seg-005':'Starter Story · 历史候选内容与选择界面',
'seg-006':'原采访所示Reddit帖局部静帧＋创始人',
'seg-007':'Gaurav谈用户观察 · 非客户通话录像',
'seg-008':'创始人介绍历史访谈机制 · 非现行试用规则',
'seg-009':'Starter Story原文摘录 · 编辑排版',
'seg-010':'Starter Story · 真实页面局部截图',
'seg-011':'Starter Story · 创始人与历史产品候选',
};
for (const id of Object.keys(labels)) labels[id]+='\nARR：2026-04-03创始人自报，非当前收入';
const overlaysBySegment=Object.fromEntries(Object.entries(labels).map(([id,sourceLabel])=>[id,{sourceLabel,badge:null}]));
const plan=buildMediaRenderPlanForTimeline({repoRoot,episodeId,audio:{originalAudioGain:0,narrationGain:1},fade:{inMs:0,outMs:0},crossfadeMs:0,overlaysBySegment});
assertMediaRenderPlanRenderable({repoRoot,episodeId});const projection=buildMediaRenderManifest({repoRoot,episodeId});assertMediaRenderManifestConsistent({repoRoot,episodeId});console.log(JSON.stringify({seconds:plan.totalSeconds,shots:plan.shots.map(s=>({id:s.segmentId,type:s.visualType})),projection:projection.artifactRef.sha256}));
