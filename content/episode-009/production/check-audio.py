"""Offline ASR is a text cross-check, not headphone listening approval."""
import json,subprocess
from pathlib import Path
r=Path('content/episode-009');s=json.loads((r/'story/script.json').read_text());audio=Path('/private/tmp/fastlane-review-audio.wav')
listing=Path('/private/tmp/fastlane-audio-list.txt');listing.write_text(''.join("file '"+str((Path.cwd()/'public/episodes/episode-009/audio'/f"{x['id']}.mp3"))+"'\n" for x in s['segments']))
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(listing),'-ar','16000','-ac','1',str(audio)],check=True)
import mlx_whisper
result=mlx_whisper.transcribe(str(audio),path_or_hf_repo='mlx-community/whisper-small-mlx',language='zh',word_timestamps=False)
(r/'production/asr-check.json').write_text(json.dumps({'scope':'offline recognition only; does not establish hearing, exact pronunciation, or editorial quality','text':result['text'],'segments':result['segments']},ensure_ascii=False,indent=2)+'\n')
print(result['text'])
