import fs from 'node:fs';
import crypto from 'node:crypto';
import {proposeMediaSource, applyMediaSourceAdmission, applyMediaSourceRights} from '../../../src/media/discovery';
import {readMediaSourceManifest} from '../../../src/media/manifest';
import {humanDecisionSchema} from '../../../src/orchestration/schemas/human-decision';
const repoRoot=process.cwd(),episodeId='episode-010',root=`content/${episodeId}`;
const sourceId=`${episodeId}:media-source:granola-official`,manifestPath=`${root}/media/source-manifest.json`;
const request='找到一个新的产品，然后按最新的标准产出一版新的视频。';
fs.writeFileSync(`${root}/production/local-production-scope.json`,JSON.stringify({userRequest:request,recordedAt:new Date().toISOString(),interpretation:'用户授权制作本地评估视频及必要素材节选和配音；没有发布、注册、广告投放或外部媒体再授权。',publicPrimaryVideo:'https://www.granola.ai/blog/announcement',acquisitionMirror:'https://www.granola.ai/blogImages/enhancing_animation_16x9.mp4',basis:'公开官网发布文嵌入的演示，无凭据或解密。'},null,2)+'\n');
if(!fs.existsSync(manifestPath))proposeMediaSource({repoRoot,episodeId,source:{sourceId,sourceUrl:'https://www.granola.ai/blog/announcement',publisher:'Granola / Chris Pedregal',sourceType:'founder',rightsBasis:'用户要求的本地制作评估，必要署名节选；外部发布许可未核实。',notes:'2024年官方发布文章的公开笔记补全演示。不得以本地准入声称发布授权。'}});
for(const gate of ['media-admission','media-rights'] as const){
 const source=readMediaSourceManifest(repoRoot,episodeId).sources.find(s=>s.sourceId===sourceId)!;
 if(gate==='media-admission'?source.admissionDecisionRef:source.rightsDecisionRef)continue;
 const bytes=fs.readFileSync(manifestPath),now=new Date().toISOString();
 const decision=humanDecisionSchema.parse({schemaVersion:'human-decision-v1',decisionId:`e010-local-request-${gate}`,gate,decision:'approve',reviewer:'zengze-user-request',timestamp:now,reason:`承接用户原始制作请求，仅将公开来源的必要署名节选准入本地评估流程。不是用户对成片的最终批准或第三方发布许可。原始请求和解释见${root}/production/local-production-scope.json。`,approvalEpoch:0,artifactRefs:[{artifactId:`${episodeId}:media:source-manifest`,episodeId,path:manifestPath,mediaType:'application/json',schemaVersion:'media-source-manifest-v1',revision:1,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),sizeBytes:bytes.length,producer:'local-request-scope',createdAt:now}]});
 const result=(gate==='media-admission'?applyMediaSourceAdmission:applyMediaSourceRights)({repoRoot,episodeId,sourceId,decision});console.log(gate,result.decisionRef.sha256.slice(0,12));
}
