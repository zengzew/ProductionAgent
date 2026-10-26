"""Crop only inspected official footage; measured TTS controls durations."""
import json,hashlib,subprocess
from pathlib import Path
r=Path('content/episode-010');source=r/'media/assets/enhance-2024.mp4';out=r/'media/prepared';out.mkdir(exist_ok=True)
s=json.loads((r/'story/script.json').read_text());timeline=json.loads((r/'production/timeline.json').read_text());dur={x['id']:x['durationFrames']/30 for x in timeline['scenes']}
recipes=[('seg-001',2.4,[450,210,1020,700],False),('seg-004',0,[450,50,1020,980],False),('seg-005',7,[535,260,850,660],True)]
observations=[];edits=[]
for sid,start,crop,freeze in recipes:
 seconds=dur[sid];x,y,w,h=crop;vf=f'crop={w}:{h}:{x}:{y},scale=984:760:force_original_aspect_ratio=decrease,pad=984:760:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,setpts=PTS-STARTPTS'
 if freeze: vf+=f',tpad=stop_mode=clone:stop_duration={seconds}'
 target=out/f'{sid}.mp4'
 subprocess.run(['ffmpeg','-v','error','-y','-ss',str(start),'-t',str(.04 if freeze else seconds),'-i',str(source),'-t',str(seconds),'-vf',vf,'-an','-r','30','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p',str(target)],check=True)
 sha=hashlib.sha256(target.read_bytes()).hexdigest();observations.append(dict(segmentId=sid,mediaId=f'episode-010:media:{sid}-{sha[:12]}',sha256=sha,textSummary={'seg-001':'官方历史演示：零散笔记展开成AllFound Overview等分层条目。','seg-004':'官方历史演示原始要点和Analyzing transcript状态，接补全结果；不是本次会议实录。','seg-005':'官方演示结果局部停帧供阅读：Current Provider、Their Requirements和Next steps；非继续生成实录。'}[sid],keywords=[sid,'Granola','notes','AllFound']))
 edits.append(dict(segmentId=sid,sourcePath=str(source),sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),sourceStartSeconds=start,seconds=seconds,cropPixels=crop,freezeForReadability=freeze,playbackRate=1,outputPath=str(target)))
 print(sid,seconds)
(r/'media/observations.json').write_text(json.dumps(observations,ensure_ascii=False,indent=2)+'\n');(r/'production/edit-recipe.json').write_text(json.dumps({'durationBasis':'measured-TTS-timeline','parts':edits},ensure_ascii=False,indent=2)+'\n')
