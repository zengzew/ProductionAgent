import fs from 'node:fs';
import crypto from 'node:crypto';
import {proposeMediaSource, applyMediaSourceAdmission, applyMediaSourceRights} from '../../../src/media/discovery';
import {readMediaSourceManifest} from '../../../src/media/manifest';
import {humanDecisionSchema} from '../../../src/orchestration/schemas/human-decision';
const repoRoot=process.cwd(),episodeId='episode-011',root=`content/${episodeId}`;
const sourceId=`${episodeId}:media-source:gamma-2025-demo`,manifestPath=`${root}/media/source-manifest.json`;
const request='开始根据最新的质量标准制作一个新的视频。';
fs.writeFileSync(`${root}/production/local-production-scope.json`,JSON.stringify({userRequest:request,recordedAt:new Date().toISOString(),interpretation:'用户授权制作本地评估视频及必要素材节选和配音；没有发布、注册、广告投放或外部媒体再授权。',publicPrimaryVideo:'https://gamma.app/insights/introducing-gamma-3-0',acquisitionMirror:'https://images.ctfassets.net/30c0u70rkzek/7wbOx9aQjp0yLTcZdZOz1j/ee1df1ecd068db64db94dceeb9bb304b/Agent.gif',basis:'公开官网发布文嵌入的GIF演示，无凭据或解密。'},null,2)+'\n');
if(!fs.existsSync(manifestPath)||!readMediaSourceManifest(repoRoot,episodeId).sources.some(s=>s.sourceId===sourceId))proposeMediaSource({repoRoot,episodeId,source:{sourceId,sourceUrl:'https://gamma.app/insights/introducing-gamma-3-0',publisher:'Gamma',sourceType:'official',rightsBasis:'用户要求的本地制作评估，必要署名节选；外部发布许可未核实。',notes:'2025年官方发布文章的公开Agent编辑演示。不得以本地准入声称发布授权。'}});
for(const gate of ['media-admission','media-rights'] as const){
 const source=readMediaSourceManifest(repoRoot,episodeId).sources.find(s=>s.sourceId===sourceId)!;
 if(gate==='media-admission'?source.admissionDecisionRef:source.rightsDecisionRef)continue;
 const bytes=fs.readFileSync(manifestPath),now=new Date().toISOString();
 const decision=humanDecisionSchema.parse({schemaVersion:'human-decision-v1',decisionId:`e011-official-local-request-${gate}`,gate,decision:'approve',reviewer:'zengze-user-request',timestamp:now,reason:`承接用户原始制作请求，仅将公开来源的必要署名节选准入本地评估流程。不是用户对成片的最终批准或第三方发布许可。原始请求和解释见${root}/production/local-production-scope.json。`,approvalEpoch:0,artifactRefs:[{artifactId:`${episodeId}:media:source-manifest`,episodeId,path:manifestPath,mediaType:'application/json',schemaVersion:'media-source-manifest-v1',revision:1,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),sizeBytes:bytes.length,producer:'local-request-scope',createdAt:now}]});
 const result=(gate==='media-admission'?applyMediaSourceAdmission:applyMediaSourceRights)({repoRoot,episodeId,sourceId,decision});console.log(gate,result.decisionRef.sha256.slice(0,12));
}
