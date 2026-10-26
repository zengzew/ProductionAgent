"""Reproducible pitch-preserving pacing repair from archived original TTS.
Never uses already-retimed audio. Provider timings are transformed with the audio.
"""
import json, subprocess, hashlib
from pathlib import Path
root=Path('content/episode-010/production'); source=root/'pacing-source'
metadata=json.loads((source/'tts-metadata.json').read_text())
rates=[1,.94,.80,.94,1,.90,.91,.96,.94]
tails=[.28,.30,.38,.30,.48,.32,.48,.50,.35]
records=[]
for entry,rate,tail in zip(metadata['files'],rates,tails):
 sid=entry['segmentId']; original=source/'audio'/f'{sid}.mp3'; target=Path('public')/entry['file']
 stamps=entry['timestamps']; cuts=[(a['endMs']+b['startMs'])/2000 for a,b in zip(stamps,stamps[1:])]
 # Add 180 ms at real provider sentence boundaries, inside the existing silence.
 bounds=[0,*cuts]; filters=[]; inputs=[]
 for i,start in enumerate(bounds):
  end=f':end={cuts[i]}' if i<len(cuts) else ''
  filters.append(f'[0:a]atrim=start={start}{end},asetpts=PTS-STARTPTS,atempo={rate}[a{i}]');inputs.append(f'[a{i}]')
  if i<len(cuts):
   filters.append(f'anullsrc=r=48000:cl=mono,atrim=duration=0.18[z{i}]');inputs.append(f'[z{i}]')
 filters.append(''.join(inputs)+f'concat=n={len(inputs)}:v=0:a=1,loudnorm=I=-16:TP=-1.5:LRA=7,aresample=48000,asetpts=N/SR/TB[out]')
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(original),'-filter_complex',';'.join(filters),'-map','[out]','-ar','48000','-b:a','192k',str(target)],check=True)
 for i,t in enumerate(stamps):
  t['startMs']=t['startMs']/rate+i*180;t['endMs']=t['endMs']/rate+i*180
 entry['timestampSource']='minimax:sentence+measured-pacing-transform'
 records.append({'segmentId':sid,'tempoFactor':rate,'additionalSentencePauseMs':180 if cuts else 0,'timelineTailSeconds':tail,'sourceSha256':hashlib.sha256(original.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(target.read_bytes()).hexdigest()})
metadata['pacingRevision']={'method':'ffmpeg atempo, pitch preserved; sentence-boundary silence inserted; timestamps transformed','sourceMetadata':'production/pacing-source/tts-metadata.json','providerSpeedIsOriginal':True,'segments':records}
(root/'tts-metadata.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
config=Path('content/episode-010/episode.config.json');cfg=json.loads(config.read_text());cfg['production']['timelineTailSeconds']={r['segmentId']:r['timelineTailSeconds'] for r in records};config.write_text(json.dumps(cfg,ensure_ascii=False,indent=2)+'\n')
(root/'pacing-revision.json').write_text(json.dumps(metadata['pacingRevision'],ensure_ascii=False,indent=2)+'\n')
