# -*- coding: utf-8 -*-
"""Reproduce portrait source excerpts. Does not render or hand-edit the final MP4."""
import json,pathlib,subprocess,hashlib,html,sys
R=pathlib.Path(__file__).resolve().parents[3]; E=R/'content/episode-008'; D=E/'media/prepared';D.mkdir(parents=True,exist_ok=True)
M=json.loads((E/'media/source-manifest.json').read_text());parents={a['mediaId'].split(':')[-1]:R/a['artifactRef']['path'] for a in M['assets'] if a['kind']=='original'}
font='/System/Library/Fonts/Hiragino Sans GB.ttc'
recipes={
 'prepared-hook':[('lovable-save-2535',15.8,3.6,[730,60,980,680],'记下心情，刷新还在','保存结果 → 刷新 → 记录保留')],
 'prepared-chat':[('lovable-chat-1670',12,4,[265,565,505,460],'用聊天，添加功能','输入请求'),('lovable-chat-1670',16,4,[265,565,505,460],'用聊天，添加功能','发送 → 出现反馈'),('lovable-chat-1670',23,4,[760,90,950,650],'用聊天，添加功能','同一个心情记录应用')],
 'prepared-mechanism':[('lovable-login-1794',0,2.8,[965,140,625,530],'让网页真正用起来','01  登录进入应用'),('lovable-save-2535',8,6,[740,70,1000,650],'让网页真正用起来','02  填写并保存'),('lovable-save-2535',37,3.8,[835,65,555,150],'让网页真正用起来','03  对照数据库记录')]
}
recipes['prepared-hook-stable']=[('lovable-save-2535',12,3.6,[730,60,980,680],'记下心情，刷新还在','保存结果 → 刷新 → 记录保留')]
recipes['prepared-mechanism-timed']=[('lovable-login-1794',0,2.4,[965,140,625,530],'让网页真正用起来','01  登录进入应用'),('lovable-save-2535',9.5,3,[740,70,1000,650],'让网页真正用起来','02  填写并保存'),('lovable-save-2535',37,2.6,[835,65,555,150],'让网页真正用起来','03  对照数据库记录')]
only=sys.argv[1] if len(sys.argv)>1 else None
record_file=E/'production/vertical-edit-recipe.json'
records=[r for r in json.loads(record_file.read_text())['parts'] if r['output']!=only] if only and record_file.exists() else []
for slug,parts in recipes.items():
 if only and slug!=only:continue
 files=[]
 for i,(parent,start,duration,crop,title,step) in enumerate(parts):
  x,y,w,h=crop
  for key,text in [('title',title),('step',step),('source','Lovable · 2024 官方演示节选')]: (D/(slug+'-'+str(i)+'-'+key+'.txt')).write_text(text)
  # Focus on source UI, preserve aspect ratio, never reconstruct controls or values.
  filters=f'crop={w}:{h}:{x}:{y},scale=960:850:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:500:color=0x090d16,setsar=1'
  overlay=D/f'{slug}-{i}-overlay.png'
  svg='<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">'
  for text,size,yy,color in [(title,65,290,'white'),(step,37,413,'#afff70'),('Lovable · 2024 官方演示节选',27,1430,'#b1bac9')]:
   svg+=f'<text x="60" y="{yy}" fill="{color}" font-family="Hiragino Sans GB, sans-serif" font-size="{size}">{html.escape(text)}</text>'
  svg+='</svg>'
  subprocess.run(['/Users/zengze/.nvm/versions/node/v24.13.0/bin/node','--input-type=module','-e',"import fs from 'node:fs';import sharp from 'sharp';await sharp(fs.readFileSync(0)).png().toFile(process.argv[1]);",str(overlay)],input=svg,text=True,check=True,cwd=R)
  out=D/f'{slug}-part-{i}.mp4';subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss',str(start),'-t',str(duration),'-i',str(parents[parent]),'-i',str(overlay),'-filter_complex','[0:v]'+filters+'[base];[base][1:v]overlay=0:0','-an','-r','30','-c:v','libx264','-crf','18','-preset','fast','-pix_fmt','yuv420p',str(out)],check=True);files.append(out)
  records.append(dict(output=slug,part=i,parentMediaId='episode-008:media:'+parent,parentSha256=hashlib.sha256(parents[parent].read_bytes()).hexdigest(),localStartSeconds=start,durationSeconds=duration,cropPixels=crop,sourceOffsetSeconds={'lovable-save-2535':2535,'lovable-login-1794':1794,'lovable-chat-1670':1670}[parent],overlay=step))
 listing=D/(slug+'-concat.txt');listing.write_text(''.join("file '"+str(f)+"'\n" for f in files));out=D/(slug+'.mp4');subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(listing),'-c','copy','-movflags','+faststart',str(out)],check=True)
 print(slug,hashlib.sha256(out.read_bytes()).hexdigest())
(E/'production/vertical-edit-recipe.json').write_text(json.dumps({'purpose':'source excerpt preparation, not final delivery','renderer':'ffmpeg libx264 crf18 1080x1920 30fps','parts':records},ensure_ascii=False,indent=2)+'\n')
