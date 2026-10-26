import fs from "node:fs";
import sharp from "sharp";
import {execFileSync} from "node:child_process";
const r = "content/episode-012",
  out = `${r}/media/cards`;
fs.mkdirSync(out, {recursive: true});
const esc = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
const t = (x, y, s, size = 32, color = "#eee") =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${color}">${esc(s)}</text>`;
const pic = async (p, x, y, w, h) =>
  `<image x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${(await sharp(p).png().toBuffer()).toString("base64")}"/>`;
const save = async (name, body) =>
  sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="984" height="760"><rect width="984" height="760" fill="#10131c"/><g font-family="PingFang SC,Hiragino Sans GB,sans-serif" fill="white">${body}</g></svg>`,
    ),
  )
    .png()
    .toFile(`${out}/${name}.png`);
await save(
  "founder",
  (await pic(`${r}/media/raw/founders.png`, 20, 15, 944, 460)) +
    t(44, 525, "Matthieu Rouif｜Photoroom 联合创始人", 34, "#f4d66c") +
    t(44, 602, "在 GoPro 时，觉得抠图太麻烦", 40) +
    t(44, 660, "随后去学习机器学习", 35) +
    t(44, 724, "2024年本人访谈回忆｜照片：Stripe 2023访谈", 23, "#b1b9cb"),
);
await save(
  "prototype",
  t(44, 85, "两个人，把想法做出来", 43, "#f4d66c") +
    (await pic(`${r}/media/raw/founders.png`, 44, 130, 896, 390)) +
    t(44, 595, "两周", 72, "#f4d66c") +
    t(245, 595, "第一版 Photoroom", 43) +
    t(44, 667, "Matthieu Rouif ＋ Eliot Andres", 30) +
    t(44, 725, "创始人回忆｜首版去背景，不等于今天所有功能", 23, "#b1b9cb"),
);
await sharp(`${r}/media/raw/official-remover-page.png`)
  .extract({left: 390, top: 420, width: 650, height: 550})
  .png()
  .toFile(`${r}/media/cards/upload-crop.png`);
await save(
  "upload",
  t(44, 74, "从手里的商品照片开始", 43, "#f4d66c") +
    (await pic(`${r}/media/cards/upload-crop.png`, 20, 120, 944, 570)) +
    t(44, 730, "官网真实入口｜官方演示不是本次上传/生成实测", 23, "#b1b9cb"),
);
await save(
  "scene",
  t(44, 70, "同一件商品，换一个场景", 43, "#f4d66c") +
    (await pic(`${r}/media/raw/official-background-example.webp`, 20, 110, 944, 580)) +
    t(44, 731, "官网场景示例｜图中帖子样式并非真实投放证据", 23, "#b1b9cb"),
);
await save(
  "trust",
  t(44, 85, "背景可以变", 54, "#f4d66c") +
    t(44, 172, "商品细节与瑕疵，要留下", 43) +
    t(44, 290, "卖家卖的是手里的真东西", 35) +
    (await pic(`${r}/media/raw/founders.png`, 44, 350, 896, 280)) +
    t(44, 682, "Matthieu Rouif · Stripe访谈 · 2023-04-07", 25, "#b1b9cb") +
    t(44, 727, "创始人的设计取向｜不是每次生成的准确率保证", 23, "#b1b9cb"),
);
await save(
  "growth",
  t(44, 80, "让卖家先看到照片的变化", 43, "#f4d66c") +
    t(44, 185, "免费去背景", 62) +
    t(44, 242, "降低开始使用的门槛", 33, "#b1b9cb") +
    t(44, 360, "TikTok 效果演示", 55, "#f4d66c") +
    t(44, 425, "原场景 → 去背景后的商品", 36) +
    t(44, 580, "Olivier Lemarié｜当时的增长负责人", 29) +
    t(44, 668, "Subscription League · 2023-03-01 · 12:42 / 13:24", 23, "#b1b9cb") +
    t(44, 724, "历史访谈转述·编辑排版｜非当前免费政策或帖子实录", 21, "#b1b9cb"),
);
await save(
  "creators",
  t(44, 80, "找到主动发布演示的用户", 43, "#f4d66c") +
    t(44, 220, "联系合作", 53) +
    t(44, 310, "↓", 49, "#f4d66c") +
    t(44, 408, "把优质内容做成广告素材", 48) +
    t(44, 485, "用于社交平台的付费投放", 33, "#b1b9cb") +
    t(44, 630, "重点是内容本身，而不只是粉丝数量", 31) +
    t(44, 687, "增长负责人访谈 · 14:21 / 16:21 / 17:36", 24, "#b1b9cb") +
    t(44, 731, "历史做法转述·编辑排版｜非真实投放后台", 23, "#b1b9cb"),
);
await save(
  "funding",
  t(44, 85, "Photoroom 公司披露", 36, "#b1b9cb") +
    t(44, 170, "2024-02-27", 37) +
    t(44, 305, "B轮融资", 51) +
    t(44, 440, "4300 万美元", 87, "#f4d66c") +
    t(44, 573, "公司新闻稿 · PR Newswire", 31) +
    t(44, 681, "历史融资额｜不是收入、利润或当前估值", 26, "#b1b9cb") +
    t(44, 727, "原文数据·编辑排版", 24, "#b1b9cb"),
);
console.log("prepared 8 source-labelled editorial cards");
