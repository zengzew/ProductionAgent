import fs from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';
const root='content/episode-010',out='public/episodes/episode-010/assets';
const base=(body)=>`<svg xmlns="http://www.w3.org/2000/svg" width="984" height="760"><rect width="984" height="760" fill="#101311"/><g font-family="PingFang SC,Hiragino Sans GB,sans-serif" fill="white">${body}</g></svg>`;
const text=(x,y,s,size=32,color='#eee')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${color}">${s}</text>`;
const pic=(buffer,x,y,w,h)=>`<image x="${x}" y="${y}" width="${w}" height="${h}" href="data:image/png;base64,${buffer.toString('base64')}"/>`;
const save=async(name,body)=>sharp(Buffer.from(base(body))).png().toFile(`${out}/${name}.png`);
const photo=await sharp(`${root}/media/assets/chris.jpg`).png().toBuffer();
const issue=await sharp(`${out}/announcement-0.png`).resize(860).png().toBuffer();
await save('founder',pic(photo,42,45,300,300)+text(382,140,'Chris Pedregal',45)+text(382,205,'Granola 联合创始人',30,'#f4d66c')+text(42,425,'AI纪要常常太笼统',48,'#f4d66c')+pic(issue,42,465,860,177)+text(42,712,'真实页面局部 · 2024-05-22 发布文章',26,'#aaa'));
const figure=sharp(`${root}/media/assets/notes-2024.png`);
const raw=await figure.clone().extract({left:115,top:280,width:645,height:405}).png().toBuffer();
const enhanced=await figure.clone().extract({left:870,top:280,width:1320,height:568}).png().toBuffer();
await save('human-ai',text(42,74,'人写下的重点',36,'#f4d66c')+pic(raw,42,100,404,253)+text(478,179,'100，扩张中',39)+text(42,426,'AI补全上下文',36,'#f4d66c')+pic(enhanced,42,456,888,274)+text(478,249,'中文释义 · 非应用内中文UI',22,'#aaa'));
const defs=[['founder','seg-002','screenshot','announcement','创始人照片＋真实原文局部；编辑合版'],['human-ai','seg-003','image','announcement','官网原图裁切＋中文释义；非应用内中文UI'],['human-ai','seg-009','image','announcement','官网原图回看黑色用户要点与灰色AI补全；中文释义']];
for(const [name,ids,title,sub,files] of [
 ['early-users',['seg-006'],'先把一小群人的会议记好','封闭测试 → 公开发布 → 投资人和负责人使用',['series-a-0','series-a-1']],
 ['team-spread',['seg-007'],'从负责人，传到团队','按公司2024年披露；不推定分享带来多少增长',['series-a-2','series-a-3']],
]){
 let body=text(42,87,title,45,'#f4d66c')+text(42,150,sub,27,'#bcbfb7');
 let y=220;
 for(const file of files){const buffer=await sharp(`${out}/${file}.png`).resize(890).png().toBuffer();const m=await sharp(buffer).metadata();body+=pic(buffer,42,y,890,m.height);y+=m.height+45;}
 body+=text(42,718,'真实页面局部截图 · Granola · 2024-10-23',25,'#aaa');await save(name,body);defs.push([name,ids[0],'screenshot','series-a','真实原文局部截图＋编辑中文释义']);
}
const funding=await sharp(`${out}/series-c-0.png`).resize(888).png().toBuffer();
const date=await sharp(`${out}/series-c-date.png`).png().toBuffer();
await save('funding',text(42,78,'Granola 公司披露',32,'#aab1a4')+text(42,195,'C轮融资 1.25 亿美元',57,'#f4d66c')+text(42,279,'估值 15 亿美元',48)+pic(funding,42,365,888,182)+pic(date,42,590,180,29)+text(250,615,'2026-03-25',29)+text(42,715,'真实页面局部截图 · 融资及估值，非收入',25,'#aaa'));
defs.push(['funding','seg-008','screenshot','series-c','融资原文真实截图＋中文释义，保留日期与公司身份']);
const s=JSON.parse(fs.readFileSync(`${root}/story/script.json`,'utf8'));
const manifest=defs.map(([name,seg,type,slug,usage],i)=>({id:`granola-still-${i}`,type,path:`${out}/${name}.png`,sourceUrl:'https://www.granola.ai/blog/'+slug,owner:'Granola / Chris Pedregal；本期中文释义与编辑排版',licenseOrBasis:'用户授权本地制作观看版；公开第一方材料必要引用，外部发布权利尚待终审。',capturedAt:'2026-10-16',usage,approved:true,usedInRender:true,claimIds:s.segments.find(x=>x.id===seg).claimIds,segmentIds:[seg]}));
fs.writeFileSync(`${root}/production/asset-manifest.json`,JSON.stringify(manifest,null,2)+'\n');
const lineage=fs.readdirSync(out).filter(x=>x.endsWith('.png')).map(name=>({path:`${out}/${name}`,sha256:crypto.createHash('sha256').update(fs.readFileSync(`${out}/${name}`)).digest('hex')}));
fs.writeFileSync(`${root}/production/still-lineage.json`,JSON.stringify({scope:'真实截图局部和官方原图裁切；中文文字为明确标注的编辑释义；无仿制应用UI。',images:lineage},null,2)+'\n');
console.log('prepared',manifest.length,'still entries');
