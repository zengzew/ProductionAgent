"""Generate measured V2 excerpts from checked source windows; no manual MP4 edits."""
import json,hashlib,subprocess
from pathlib import Path
r=Path('content/episode-009-v2'); out=r/'media/prepared'; out.mkdir(parents=True,exist_ok=True)
source=r/'media/assets/fastlane-interview.mp4'; parent=hashlib.sha256(source.read_bytes()).hexdigest()
timeline=json.loads((r/'production/timeline.json').read_text()); d={s['id']:s['durationFrames']/30 for s in timeline['scenes']}
face=[500,60,1000,1000]; card=[630,130,520,875]
# Each part: start, output seconds, crop x/y/w/h, freeze for reading.
parts={
 'seg-001':[(797.5,d['seg-001'],[630,150,520,690],False)],
 'seg-002':[(170.5,min(7.8,d['seg-002']),face,False)]+([(75,d['seg-002']-7.8,face,False)] if d['seg-002']>7.8 else []),
 'seg-003':[(115.8,2.7,[0,0,1920,1080],False),(797.5,d['seg-003']-2.7,card,False)],
 'seg-004':[(820,1.6,card,False),(805.5,1.0,[330,135,1050,765],False),(814,d['seg-004']-2.6,[340,250,1035,350],True)],
 'seg-005':[(815,d['seg-005'],card,False)],
 'seg-006':[(690,1.6,[440,295,1040,155],True),(694,d['seg-006']-1.6,face,False)],
 'seg-007':[(699,d['seg-007'],face,False)],
 'seg-008':[(426,d['seg-008'],face,False)],
 'seg-011':[(173,3.0,face,False),(825.1,d['seg-011']-3.0,card,False)],
}
records=[]
def run(args): subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*args],check=True)
for seg,items in parts.items():
 files=[]
 for i,(start,seconds,crop,freeze) in enumerate(items):
  if seconds<=0: raise ValueError((seg,seconds))
  x,y,w,h=crop; p=out/f'{seg}-{i}.mp4'
  vf=f'crop={w}:{h}:{x}:{y},scale=984:760:force_original_aspect_ratio=decrease,pad=984:760:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,setpts=PTS-STARTPTS'+(f',tpad=stop_mode=clone:stop_duration={seconds}' if freeze else '')
  run(['-ss',str(start),'-t',str(.04 if freeze else seconds),'-i',str(source),'-t',str(seconds),'-vf',vf,'-an','-r','30','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p',str(p)])
  files.append(p); records.append(dict(segmentId=seg,part=i,sourcePath=str(source),sourceSha256=parent,sourceStartSeconds=start,seconds=seconds,playbackRate=1,freezeForReadability=freeze,cropPixels=crop,outputPath=str(p)))
 listing=out/f'{seg}.concat.txt';listing.write_text(''.join("file '"+p.name+"'\n" for p in files))
 run(['-f','concat','-safe','0','-i',str(listing),'-c','copy','-movflags','+faststart',str(out/f'{seg}.mp4')]);print(seg,d[seg],flush=True)
(r/'production/edit-recipe.json').write_text(json.dumps(dict(durationBasis='measured-TTS-timeline',sourceSha256=parent,parts=records),ensure_ascii=False,indent=2)+'\n')
summaries={
 'seg-001':'Cal AI产品的宣传候选，原片历史演示；不等于现场输入与生成。',
 'seg-002':'Gaurav本人访谈，讲自身做应用后遇到推广困难；保留真实机位切换。',
 'seg-003':'原片官网网址输入宣传动效，接已生成候选；非本次输入生成实测。',
 'seg-004':'历史滑卡选择接账号选择及真实Schedule选项短暂停留，中间步骤省略，不证明发布成功。',
 'seg-005':'同一产品候选从图文到短视频切换，X、Edit和接受控件可见；不是营销效果证据。',
 'seg-006':'原采访中Reddit r/SideProject帖子标题局部静帧，裁去3000+用户数字，接创始人本人；非本次发帖。',
 'seg-007':'Gaurav本人谈用户试用观察，不是客户共享屏幕实录。',
 'seg-008':'Gaurav本人谈访谈激励；额外七天为历史做法，不冒充当前试用规则。',
 'seg-011':'先回创始人再回Cal AI宣传候选，呈现人物与已展示产品用途的关系。'}
entries=[]
for seg,summary in summaries.items():
 sha=hashlib.sha256((out/f'{seg}.mp4').read_bytes()).hexdigest();entries.append(dict(segmentId=seg,mediaId=f'episode-009-v2:media:{seg}-{sha[:12]}',sha256=sha,textSummary=summary,keywords=[seg,'Fastlane','人物' if seg in ['seg-002','seg-006','seg-007','seg-008'] else '产品'],inspection='Source frames checked; prepared excerpts require current bounded visual inspection.'))
(r/'media/observations.json').write_text(json.dumps(entries,ensure_ascii=False,indent=2)+'\n')
