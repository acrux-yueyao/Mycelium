# 宣传视频

全部素材都从网站本身录出来（不是另画的），再用 ffmpeg 拼成一支片子。

```
node_modules/.bin/vite build && node_modules/.bin/vite preview --port 4323 &
node scripts/promo/record.mjs   <clips>            # 录素材:着陆页→输入→标本卡→田野、三个机制、星空、装置照片
node scripts/promo/captions.mjs <clips>            # 字幕层(网站字体,英文大、中文小),PNG
node scripts/promo/assemble.mjs <clips> out.mp4    # 自动生成配乐(网站的环境音)并合成,1920×1080 · 30fps
```

- 改字幕:`captions.mjs` 里的 `CAPTIONS`。
- 改镜头长短/顺序:`assemble.mjs` 里的 `SEG`,字幕时间点 `CAP` 会跟着 `timeline.json` 走。
- 只重录一个镜头:`ONLY=slides node scripts/promo/record.mjs <clips>`。
- 成片:`design/promo/Mycelium_promo.mp4`。
