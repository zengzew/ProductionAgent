# Episode 012 制作与验证记录

Repository：`/Users/zengze/Documents/ProductionAgent`，master。2026-10-25用户明确“授权”后进入本地制作。原有dirty工作树和既有Episode保留；未新建分支、提交、上传或发布。

| 项目              | 实际结果                                                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Changed scope     | 新增本期content/public/output；共享实现仅增加episode-012渲染器注册，以及五个已回读来源的精确hostname白名单，保留原有修改                                                                  |
| 内容授权          | persistHumanDecision保存当前授权；content-manifest.json绑定5份批准输入，最终再次确认字节未改。旁白未改，仅首段预算由4秒校正为3秒                                                          |
| 来源/故事/内容    | 选题ready；validate:episode --profile production通过。6来源、10事实、5事件、9段；workflow仍为story-approved，Delivery pending                                                             |
| 真实配音          | MiniMax/speech-2.8-hd、Chinese (Mandarin)_Reliable_Executive、speed 1.2；9段，fallbackUsed=false。没有重配或统一后期调速                                                                  |
| 字幕              | timeline与verify-captions通过；22条，最短1.048秒，0条小于1秒；检查的是实际生成字幕的中文语义与英文专名边界                                                                                |
| 媒体              | 按本地授权持久化来源准入/权利解释，执行ingest → index → retrieve → 本会话实际抽帧核验 → select → render plan；9个当前镜头均有对应核验，无未验证fallback                                   |
| 当前MP4           | 48.4秒，1080×1920，30fps，H.264/AAC 48kHz，峰值-1.7dB；inspect:output及全片ffmpeg解码通过                                                                                                 |
| 画面              | 已查看完整每两秒联系表、首帧、官网入口、融资和最终帧；上传按钮采用原始截图局部。证据区blackdetect未检出持续黑屏                                                                           |
| 结尾修订          | 原首版保存在revisions/v1；最后一秒改为开头同一黄色杯子的干净白底结果，从源镜头重新核验并渲染。旁白、总时长不变；v1/v2编码音轨SHA-256一致                                                  |
| 节奏测量          | 原音已有停顿计入；八处段间低能量间隔0.484–0.681秒。未为凑60秒拉长静帧或逐句加停顿；测量不代替自然听感                                                                                     |
| 定向代码测试      | 渲染契约影响的5文件32项通过，media-discovery另1文件13项通过，共45项。使用当前Node 22.23.2运行，不冒充Node 24 CI                                                                           |
| 格式/静态检查     | render-contract.ts与media-discovery.json的Prettier通过；render-contract.ts定向ESLint通过；本期生产脚本格式化；定向git diff --check通过                                                    |
| release / Not run | release实际运行，研究/故事/内容先通过，在speechClippingOrSwallowing=null处退出1。完整有声观看、耳机听辨和独立Delivery未完成；没有把未知写成false。未跑全量Vitest、coverage或全仓typecheck |
| Git status        | 本期目录为未跟踪；两个共享文件包含既存修改及本次增量，其他工作区改动保留                                                                                                                  |
| Residual risk     | 英文专名读音、吞字及连续听感未知；官方宣传非本次实测，人物静照及转述卡占比仍较高；外部发布权利、最终批准与发布未完成                                                                      |

执行命令沿用仓库脚本：materialize:story、validate:content --pre-production、tts、timeline、media生产API、render:vertical、inspect:output、validate:episode --profile release。TypeScript CLI使用`node --import tsx`，避免pnpm/tsx环境入口差异。运行日志、批准记录、源镜头recipe、核验请求/结果和当前文件指纹都保存在本期目录。

- output/episode-012/vertical_9x16.mp4: `1a3bd44bffe84481ee17976504f00701944ed84cf3e069c601e681d3b4e95011`
- output/episode-012/subtitles_zh.srt: `6615da868e7a02922a61831701c1b004a2342ede6fe0bbe2afb1d386d3c9a049`
- content/episode-012/production/timeline.json: `35c0ea41d261148730d981b3a7e8f9246a2de1b3bb037b7cc1ebd5a900d72805`
