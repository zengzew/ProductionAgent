"""V4 pacing from immutable real provider audio; reruns never compound transforms."""
import json,subprocess,hashlib,shutil
from pathlib import Path
root=Path('content/episode-011/production');source=root/'pacing-source-v4'
metadata=json.loads((source/'tts-metadata.json').read_text())
records=[]
for entry in metadata['files']:
 sid=entry['segmentId'];original=source/'audio'/f'{sid}.mp3';target=Path('public')/entry['file']
 rate=.96 if sid in ['seg-007','seg-010'] else 1
 # Give the denser onboarding explanation room; no universal sentence padding.
 stamps=entry['timestamps'];adds=[.10 if sid=='seg-010' else .15 if sid=='seg-009' and i==1 else 0 for i in range(len(stamps)-1)]
 cuts=[(a['endMs']+b['startMs'])/2000 for a,b in zip(stamps,stamps[1:])]
 if rate==1 and not any(adds):shutil.copy2(original,target)
 else:
  filters=[];inputs=[]
  for i,start in enumerate([0,*cuts]):
   end=f':end={cuts[i]}' if i<len(cuts) else ''
   filters.append(f'[0:a]atrim=start={start}{end},asetpts=PTS-STARTPTS,atempo={rate}[a{i}]');inputs.append(f'[a{i}]')
   if i<len(adds) and adds[i]:
    filters.append(f'anullsrc=r=48000:cl=mono,atrim=duration={adds[i]}[z{i}]');inputs.append(f'[z{i}]')
  filters.append(''.join(inputs)+f'concat=n={len(inputs)}:v=0:a=1,loudnorm=I=-16:TP=-1.5:LRA=7,aresample=48000,asetpts=N/SR/TB[out]')
  subprocess.run(['ffmpeg','-v','error','-y','-i',str(original),'-filter_complex',';'.join(filters),'-map','[out]','-ar','48000','-b:a','192k',str(target)],check=True)
  for i,stamp in enumerate(stamps):
   extra=sum(adds[:i])*1000;stamp['startMs']=stamp['startMs']/rate+extra;stamp['endMs']=stamp['endMs']/rate+extra
  entry['timestampSource']='minimax:sentence+measured-pacing-transform'
 records.append({'segmentId':sid,'tempoFactor':rate,'additionalSentencePauseMs':[round(x*1000) for x in adds],'sourceSha256':hashlib.sha256(original.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(target.read_bytes()).hexdigest()})
metadata['pacingRevision']={'method':'semantic transition tails, selective sentence breathing, optional pitch-preserving atempo; original pauses counted','sourceMetadata':'production/pacing-source-v4/tts-metadata.json','providerSpeedIsOriginal':True,'segments':records}
(root/'tts-metadata.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
(root/'pacing-revision.json').write_text(json.dumps(metadata['pacingRevision'],ensure_ascii=False,indent=2)+'\n')
