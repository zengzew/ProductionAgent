"""Offline ASR of the final MP4; this does not substitute for listening."""
from pathlib import Path
import hashlib,json,subprocess,sys
r=Path('content/episode-010');video=Path('output/episode-010/vertical_9x16.mp4');audio=Path('/private/tmp/granola-final-asr.wav')
subprocess.run(['ffmpeg','-v','error','-y','-i',str(video),'-vn','-ar','16000','-ac','1',str(audio)],check=True)
sys.modules['coverage']=None
import mlx_whisper
model=Path('/Users/zengze/.cache/huggingface/hub/models--mlx-community--whisper-small-mlx/snapshots/45f3915923c7a79a5a5b5a7d909d39aeb0e5630e');assert model.exists()
result=mlx_whisper.transcribe(str(audio),path_or_hf_repo=str(model),language='zh',word_timestamps=False)
record={'scope':'Final MP4 offline text cross-check; no hearing, pronunciation or rhythm approval.','videoSha256':hashlib.sha256(video.read_bytes()).hexdigest(),'text':result['text'],'segments':result['segments']}
(r/'production/asr-check.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n');print(result['text'])
