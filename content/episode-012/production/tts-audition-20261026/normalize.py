"""Match loudness only; keep each model's natural tempo and complete utterance."""
import pathlib,json,subprocess,re,hashlib
r=pathlib.Path('output/episode-012/tts-audition-20261026')
def run(args):return subprocess.run(args,capture_output=True,text=True,check=True)
def measure(p):
 result=run(['ffmpeg','-hide_banner','-i',str(p),'-af','loudnorm=I=-16:TP=-1.5:LRA=7:print_format=json','-f','null','-'])
 return json.loads(re.findall(r'\{[^{}]+\}',result.stderr)[-1])
rows=[]
for label in ['A-plus-xunanchuan','B-flash-anmingyuan']:
 meta=json.loads((r/f'{label}-metadata.json').read_text());assert meta['status']=='generated'
 raw=r/f'{label}-raw.wav';dest=r/f'{label}.mp3';m=measure(raw)
 af=f"volume={-23.0-float(m['input_i']):.4f}dB"
 run(['ffmpeg','-hide_banner','-v','error','-y','-i',str(raw),'-af',af,'-ar','48000','-c:a','libmp3lame','-b:a','192k',str(dest)])
 run(['ffmpeg','-v','error','-i',str(dest),'-f','null','-'])
 probe=json.loads(run(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_name,sample_rate,channels','-of','json',str(dest)]).stdout)
 seconds=float(probe['format']['duration']);original=float(meta['probe']['format']['duration']);assert abs(seconds-original)<.1
 final=measure(dest);assert abs(float(final['input_i'])+23)<.5
 meta.update(normalizedFile=str(dest),normalizedSha256=hashlib.sha256(dest.read_bytes()).hexdigest(),normalizedProbe=probe,loudness={'integratedLufs':float(final['input_i']),'truePeakDb':float(final['input_tp'])},processing='Constant gain -23 LUFS match, preserving dynamics; no tempo, pitch, trimming, padding, or music changes')
 (r/f'{label}-metadata.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
 rows.append({'label':label,'model':meta['model'],'voice':meta['voice'],'seconds':seconds,'textSha256':meta['textSha256'],'file':str(dest),'sha256':meta['normalizedSha256'],'loudness':meta['loudness']})
assert abs(rows[0]['loudness']['integratedLufs']-rows[1]['loudness']['integratedLufs'])<.15
assert rows[0]['textSha256']==rows[1]['textSha256'];assert rows[0]['sha256']!=rows[1]['sha256']
for name in ['rate','pitch','volume','language_hints','instruction','seed','text']:
 a=json.loads((r/'A-plus-xunanchuan-request.json').read_text())['input'][name];b=json.loads((r/'B-flash-anmingyuan-request.json').read_text())['input'][name];assert a==b,name
(r/'comparison.json').write_text(json.dumps({'samples':rows,'scope':'Same existing Photoroom text, one continuous request per sample, same instruction and rate=1.0; separate from episode delivery','apiDocumentation':'https://help.aliyun.com/zh/model-studio/qwen-audio-tts-http-api'},ensure_ascii=False,indent=2)+'\n')
print(json.dumps(rows,ensure_ascii=False,indent=2))
