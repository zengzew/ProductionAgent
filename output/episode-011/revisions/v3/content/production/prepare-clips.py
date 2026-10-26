"""Only observed official GIF excerpts, cropped to preserve action; TTS determines duration."""
import json,hashlib,subprocess
from pathlib import Path
r=Path('content/episode-011');a=r/'media/assets/Agent.gif';out=r/'media/prepared';out.mkdir(exist_ok=True)
t=json.loads((r/'production/timeline.json').read_text());dur={s['id']:s['durationFrames']/30 for s in t['scenes']};obs=[];edits=[]
def h(p):return hashlib.sha256(p.read_bytes()).hexdigest()
for sid in ['seg-005','seg-009']:
 seconds=dur[sid]
 # First action: text -> diagram; second action: screenshot -> styled table. No looping.
 start=0
 window=min(seconds,5.38-start) if sid in ['seg-005','seg-009'] else min(seconds,2.25-start)
 crop=[38,0,756,420] if sid!='seg-005' else [0,0,800,450]
 x,y,w,hh=crop
 vf=f'crop={w}:{hh}:{x}:{y},scale=984:760:force_original_aspect_ratio=decrease,pad=984:760:(ow-iw)/2:(oh-ih)/2:color=0x0b0e18,setsar=1,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration={max(0,seconds-window)}'
 p=out/f'{sid}.mp4'
 subprocess.run(['ffmpeg','-v','error','-y','-ss',str(start),'-t',str(window),'-i',str(a),'-t',str(seconds),'-vf',vf,'-an','-r','30','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p',str(p)],check=True)
 summary={'seg-001':'2025官方演示：大段文字在Make this more visual后转为蓝色图示；图内数字仅为演示内容，非Gamma数据。','seg-005':'2025官方Agent演示：文字转图示，再上传截图重排为同样主题的表格；不是本次实测。','seg-009':'回看2025官方文字变图演示，结果停帧供理解“已有稿可修改”，不宣称持续生成或实测省时。'}[sid]
 obs.append(dict(segmentId=sid,mediaId=f'episode-011:media:{sid}-{h(p)[:12]}-official',sha256=h(p),textSummary=summary,keywords=[sid,'Gamma','Agent','Holographic Technology','layout','diagram']))
 edits.append(dict(segmentId=sid,sourcePath=str(a),sourceSha256=h(a),sourceStartSeconds=start,sourceWindowSeconds=window,seconds=seconds,cropPixels=crop,freezeForReadabilitySeconds=max(0,seconds-window),playbackRate=1,outputPath=str(p)))
 print(sid,seconds,window)
(r/'media/observations.json').write_text(json.dumps(obs,ensure_ascii=False,indent=2)+'\n');(r/'production/edit-recipe.json').write_text(json.dumps(dict(durationBasis='measured-TTS-timeline',parts=edits),ensure_ascii=False,indent=2)+'\n')
