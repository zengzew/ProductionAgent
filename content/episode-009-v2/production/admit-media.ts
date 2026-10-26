import fs from 'node:fs';
import crypto from 'node:crypto';
import {proposeMediaSource, applyMediaSourceAdmission, applyMediaSourceRights} from '../../../src/media/discovery';
import {readMediaSourceManifest} from '../../../src/media/manifest';
import {humanDecisionSchema} from '../../../src/orchestration/schemas/human-decision';
const repoRoot=process.cwd(),episodeId='episode-009-v2',root=`content/${episodeId}`;
const sourceId=`${episodeId}:media-source:fastlane-interview`,manifestPath=`${root}/media/source-manifest.json`;
const request='重新制作新的一版，目标是尽量贴近gold example';
fs.writeFileSync(`${root}/production/local-production-scope.json`,JSON.stringify({userRequest:request,recordedAt:new Date().toISOString(),interpretation:'用户授权制作本地评估视频及必要素材节选和配音；没有发布、注册、广告投放或外部媒体再授权。',publicPrimaryVideo:'https://www.youtube.com/watch?v=BA_fC95p43c',acquisitionMirror:'https://iframe.mediadelivery.net/embed/550405/6d17edc4-b057-4fcf-a422-fab058c18dfa?api=1',basis:'公开完整同片的发布方CDN，无凭据或解密。'},null,2)+'\n');
if(!fs.existsSync(manifestPath))proposeMediaSource({repoRoot,episodeId,source:{sourceId,sourceUrl:'https://www.youtube.com/watch?v=BA_fC95p43c',publisher:'Starter Story / Gaurav Thapa',sourceType:'founder',rightsBasis:'用户要求的本地制作评估，必要署名节选；外部发布许可未核实。',notes:'历史产品演示及创始人谈话；公开官方YouTube与发布方同片CDN。不得以本地准入声称发布授权。'}});
for(const gate of ['media-admission','media-rights'] as const){
 const source=readMediaSourceManifest(repoRoot,episodeId).sources.find(s=>s.sourceId===sourceId)!;
 if(gate==='media-admission'?source.admissionDecisionRef:source.rightsDecisionRef)continue;
 const bytes=fs.readFileSync(manifestPath),now=new Date().toISOString();
 const decision=humanDecisionSchema.parse({schemaVersion:'human-decision-v1',decisionId:`e009-v2-local-request-${gate}`,gate,decision:'approve',reviewer:'zengze-user-request',timestamp:now,reason:`承接用户原始制作请求，仅将公开来源的必要署名节选准入本地评估流程。不是用户对成片的最终批准或第三方发布许可。原始请求和解释见${root}/production/local-production-scope.json。`,approvalEpoch:0,artifactRefs:[{artifactId:`${episodeId}:media:source-manifest`,episodeId,path:manifestPath,mediaType:'application/json',schemaVersion:'media-source-manifest-v1',revision:1,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),sizeBytes:bytes.length,producer:'local-request-scope',createdAt:now}]});
 const result=(gate==='media-admission'?applyMediaSourceAdmission:applyMediaSourceRights)({repoRoot,episodeId,sourceId,decision});console.log(gate,result.decisionRef.sha256.slice(0,12));
}
