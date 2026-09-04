import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {applyMediaSourceAdmission,applyMediaSourceRights} from '../../../src/media/discovery';
import {readMediaSourceManifest} from '../../../src/media/manifest';
import {humanDecisionSchema} from '../../../src/orchestration/schemas/human-decision';
import {ingestMediaSource} from '../../../src/media/ingest';
const repoRoot=process.cwd(),episodeId='episode-008';
const manifestPath=`content/${episodeId}/media/source-manifest.json`;
const authorization={userMessages:['许启用评审子代理, goal最终产出一份mp4','继续未完成的工作'],scope:'Continue the previously described official-source local evaluation MP4. No external publication approval.',recordedAt:new Date().toISOString()};
fs.writeFileSync(`content/${episodeId}/production/local-evaluation-authorization.json`,JSON.stringify(authorization,null,2)+'\n');
for(const slug of ['lovable-office-hours','lovable-founders']){
 const sourceId=`${episodeId}:media-source:${slug}`;
 for(const gate of ['media-admission','media-rights'] as const){
  const source=readMediaSourceManifest(repoRoot,episodeId).sources.find(s=>s.sourceId===sourceId)!;
  if(gate==='media-admission'?source.admissionDecisionRef:source.rightsDecisionRef)continue;
  const bytes=fs.readFileSync(manifestPath),now=new Date().toISOString();
  const decision=humanDecisionSchema.parse({schemaVersion:'human-decision-v1',decisionId:`e008-local-evaluation-${slug}-${gate}`,gate,decision:'approve',reviewer:'zengze',timestamp:now,reason:'用户在已说明官方来源与待准入状态后要求继续未完成工作，承接最终MP4目标。范围仅本地评估、署名和必要短片节选；不表示外部发布权利终审。',approvalEpoch:0,artifactRefs:[{artifactId:`${episodeId}:media:source-manifest`,episodeId,path:manifestPath,mediaType:'application/json',schemaVersion:'media-source-manifest-v1',revision:1,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),sizeBytes:bytes.length,producer:'manual-source-review',createdAt:now}]});
  const result=(gate==='media-admission'?applyMediaSourceAdmission:applyMediaSourceRights)({repoRoot,episodeId,sourceId,decision});
  console.log(gate,slug,result.decisionRef.sha256.slice(0,12));
 }
}
const files=[['lovable-save-2535','/private/tmp/episode008-source-review.mp4','lovable-office-hours'],['lovable-login-1794','/private/tmp/episode008-login-review.mp4','lovable-office-hours'],['lovable-chat-1670','/private/tmp/episode008-chat-review.mp4','lovable-office-hours'],['lovable-founders','public/episodes/episode-008/assets/lovable-founders.jpg','lovable-founders']];
for(const [slug,file,source]of files){
 const result=await ingestMediaSource({repoRoot,episodeId,sourceId:`${episodeId}:media-source:${source}`,mediaId:`${episodeId}:media:${slug}`,adapter:{id:'observed-official-excerpt-local-copy-v1',async acquire(context){const output=path.join(context.tempDirectory,path.basename(file));fs.copyFileSync(file,output);return {filePath:output,originalFilename:path.basename(file),declaredContentType:file.endsWith('.mp4')?'video/mp4':'image/jpeg'};}}});
 console.log('ingested',slug,result.original.artifactRef.sha256.slice(0,12));
}
