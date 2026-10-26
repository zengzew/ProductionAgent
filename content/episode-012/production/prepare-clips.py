"""Assemble attributed source excerpts to the measured narration, without simulating product UI."""
import json,hashlib,pathlib,subprocess
r=pathlib.Path('content/episode-012');out=r/'media/prepared';out.mkdir(parents=True,exist_ok=True)
t=json.loads((r/'production/timeline.json').read_text());parts=[];observations=[]
def digest(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def cut(sid,index,source,seconds,start=0,still=False):
 p=out/f'{sid}-part{index}.mp4';args=['ffmpeg','-hide_banner','-loglevel','error','-y']
 if still:args+=['-loop','1']
 else:args+=['-ss',str(start)]
 args+=['-i',str(source),'-t',str(seconds),'-vf','scale=984:760:force_original_aspect_ratio=decrease,pad=984:760:(ow-iw)/2:(oh-ih)/2:color=0x10131c,setsar=1','-an','-r','30','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p',str(p)]
 subprocess.run(args,check=True);return p
source=r/'media/raw/official-background-demo.mp4'
subprocess.run(['ffmpeg','-v','error','-y','-ss','1.6','-i',str(source),'-frames:v','1',str(out/'cup-result.png')],check=True)
defs={
 'seg-001':('official',[(source,None,0,False)],'官网宣传动效展示同一商品在原场景与白底之间变化；不是本次上传或生成实测。'),
 'seg-002':('founder',[(r/'media/cards/founder.png',None,0,True)],'Stripe原始人物合照及有日期的创始人困扰回忆转述，不是GoPro历史操作。'),
 'seg-003':('founder',[(r/'media/cards/prototype.png',None,0,True)],'人物合照配两周首版历史回忆，明确初版去背景而非现行全部功能。'),
 'seg-004':('official',[(r/'media/cards/upload.png',1.35,0,True),(source,3.2,0,False),(r/'media/cards/scene.png',None,0,True)],'先显示真实官网上传入口，再接官方去背景宣传动效及椅子布景示例；不同示例，非同次生成过程。'),
 'seg-005':('trust',[(r/'media/cards/trust.png',3.2,0,True),(source,None,3,False)],'Stripe创始人商品保真取向的编辑转述，随后官网商品白底示例；不是每次生成准确率保证。'),
 'seg-006':('growth',[(r/'media/cards/growth.png',3.7,0,True),(source,None,5,False)],'2023增长负责人访谈转述免费去背景入口与TikTok演示；配官网效果，非真实TikTok帖子。'),
 'seg-007':('growth',[(r/'media/cards/creators.png',None,0,True)],'原访谈合作创作者、选择内容及社交广告素材的编辑转述，未造投放后台。'),
 'seg-008':('finance',[(r/'media/cards/funding.png',None,0,True)],'公司公告数据编辑卡，2024-02-27、B轮、4300万美元同屏，不是营收或现行估值。'),
 'seg-009':('official',[(source,5.133333333333334,0,False),(out/'cup-result.png',None,0,True)],'结尾回看官方去背景演示，最后一秒落回开头黄色杯子的干净白底结果，停帧供阅读，不延长片长，无销售效果承诺。')}
for scene in t['scenes']:
 sid=scene['id'];seconds=scene['durationFrames']/30;key,clips,summary=defs[sid];cursor=0;files=[];recipe=[]
 for i,(src,length,start,still) in enumerate(clips):
  duration=length if length is not None else seconds-cursor
  assert duration>0,(sid,duration)
  p=cut(sid,i,src,duration,start,still);files.append(p);cursor+=duration
  recipe.append(dict(source=str(src),sourceSha256=digest(src),startSeconds=start,seconds=duration,still=still))
 lst=out/f'{sid}.concat.txt';lst.write_text(''.join("file '"+p.name+"'\n" for p in files));dest=out/f'{sid}.mp4'
 subprocess.run(['ffmpeg','-v','error','-y','-f','concat','-safe','0','-i',str(lst),'-t',str(seconds),'-c','copy',str(dest)],check=True)
 observations.append(dict(segmentId=sid,sourceId=f'episode-012:media-source:{key}',mediaId=f'episode-012:media:{sid}-{digest(dest)[:12]}',sha256=digest(dest),textSummary=summary,keywords=[sid,'Photoroom',key,'attributed-local-evaluation']))
 parts.append(dict(segmentId=sid,seconds=seconds,parts=recipe,outputPath=str(dest),outputSha256=digest(dest)))
 print('prepared',sid,round(seconds,3),flush=True)
(r/'media/observations.json').write_text(json.dumps(observations,ensure_ascii=False,indent=2)+'\n');(r/'production/edit-recipe.json').write_text(json.dumps(dict(durationBasis='measured-TTS-timeline',parts=parts),ensure_ascii=False,indent=2)+'\n')
(r/'production/asset-manifest.json').write_text('[]\n')
