"""Two isolated same-text auditions; does not change episode audio or provider defaults."""
import os,json,pathlib,urllib.request,urllib.error,hashlib,concurrent.futures,datetime,subprocess
root=pathlib.Path('output/episode-012/tts-audition-20261026')
paragraphs=pathlib.Path('content/episode-012/story/narration.txt').read_text().strip().split('\n\n')
text=''.join(paragraphs[:3])+'，'.join(paragraphs[3].split('，')[:3])+'。'
instruction='像向朋友讲一个有意思的创业故事，清楚自然，有轻微起伏，按意思安排呼吸，避免播报腔。'
endpoint='https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer'
key=os.environ.get('DASHSCOPE_API_KEY') or os.environ.get('QWEN_API_KEY')
assert key,'Missing configured Alibaba credential'
(root/'text.txt').write_text(text+'\n');(root/'instruction.txt').write_text(instruction+'\n')
def h(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def synth(spec):
 label,model,voice=spec
 body={'model':model,'input':{'text':text,'voice':voice,'format':'wav','sample_rate':48000,'rate':1.0,'pitch':1.0,'volume':50,'language_hints':['zh'],'instruction':instruction,'seed':42}}
 (root/f'{label}-request.json').write_text(json.dumps(body,ensure_ascii=False,indent=2)+'\n')
 meta={'label':label,'model':model,'voice':voice,'endpoint':endpoint,'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'textSha256':hashlib.sha256(text.encode()).hexdigest(),'instruction':instruction,'inputParameters':body['input'].copy()}
 try:
  req=urllib.request.Request(endpoint,data=json.dumps(body).encode(),headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'})
  with urllib.request.urlopen(req,timeout=90) as response: data=json.load(response)
  if data.get('code'):raise RuntimeError(str(data.get('code'))+': '+str(data.get('message','')))
  url=data['output']['audio']['url']
  with urllib.request.urlopen(url,timeout=60) as response: audio=response.read()
  dest=root/f'{label}-raw.wav';dest.write_bytes(audio)
  info=json.loads(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_name,sample_rate,channels','-of','json',str(dest)],capture_output=True,text=True,check=True).stdout)
  meta.update(status='generated',requestId=data.get('request_id'),usage=data.get('usage'),finishReason=data['output'].get('finish_reason'),rawFile=str(dest),rawSha256=h(dest),probe=info)
 except urllib.error.HTTPError as e:
  raw=e.read().decode(errors='replace').replace(key,'[REDACTED]')
  try: err=json.loads(raw)
  except ValueError: err={'message':raw[:400]}
  meta.update(status='failed',httpStatus=e.code,errorCode=err.get('code'),message=err.get('message','')[:600])
 except Exception as e: meta.update(status='failed',message=str(e).replace(key,'[REDACTED]')[:600])
 (root/f'{label}-metadata.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
 return {k:meta.get(k) for k in ['label','status','httpStatus','errorCode','message','probe'] if k in meta}
specs=[('A-plus-xunanchuan','qwen-audio-3.1-tts-plus','xunanchuan_v3.1'),('B-flash-anmingyuan','qwen-audio-3.1-tts-flash','anmingyuan_v3.1')]
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 for result in pool.map(synth,specs): print(json.dumps(result,ensure_ascii=False),flush=True)
