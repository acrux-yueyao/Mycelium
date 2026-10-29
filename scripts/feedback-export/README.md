# 反馈导出

把网站「留下一段经历」收到的反馈从 Upstash 导出来。只读，不会改动或删除任何数据。

## 第一次用

在仓库根目录把 Vercel 上的环境变量拉到本地(会写进 `.env.local`，它已经在 .gitignore 里):

```
vercel env pull .env.local
```

没有装 Vercel CLI 的话，也可以去 Upstash 控制台复制 `UPSTASH_REDIS_REST_URL` 和 `UPSTASH_REDIS_REST_TOKEN`，写进根目录的 `.env.local`:

```
UPSTASH_REDIS_REST_URL="https://xxxx.upstash.io"
UPSTASH_REDIS_REST_TOKEN="xxxx"
```

## 导出

```
node scripts/feedback-export/export.mjs
```

结果在根目录的 `feedback-export/`(不会被提交到 git):

| 文件 | 用来 |
|---|---|
| `feedback-print.html` | 用浏览器打开 → 打印(或「存储为 PDF」)。A4，每段反馈一张卡片，最前面是各项状态的平均分 |
| `feedback.csv` | 用 Excel / Numbers 打开，一行一段，中文不会乱码 |
| `feedback.json` | 原始记录 |

- 时间都是波士顿时间。同一个人留下的几段会标「参与者 xxxx · 第 n 段」(需要 Vercel 上设了 `FEEDBACK_HASH_SALT`)。
- 只想先看版式：`node scripts/feedback-export/export.mjs --sample`(用几条假的示例数据)。
- 换输出位置：`--out 某个文件夹`。

导出的文件是参与者数据，按 IRB 的要求保管，别发到公开的地方。
