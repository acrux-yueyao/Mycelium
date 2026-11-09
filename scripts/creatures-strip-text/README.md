# 清除孢子记录里的原句

一次性脚本：把 Upstash 里 `mycelium:creatures` 每条记录的 `text`（访客低语的原句）删掉，只留长成的形状——情绪标签、形态参数、名字、编号、时间。删之前先按原句算出编号 `myc`（和样本卡上显示的 MYC-… 一致）写回记录，这样原句没了编号也不变。

```bash
node scripts/creatures-strip-text/strip-text.mjs            # 只看会改多少条，不写任何东西
node scripts/creatures-strip-text/strip-text.mjs --apply    # 先备份到仓库外，再改
```

- 备份默认写到 `~/mycelium-raw-export/creatures-raw-<时间>.json`，可用 `--backup 路径` 指定；路径在仓库内会拒绝。备份含原句，不要提交、用完请自行处置。
- 改写是一条原子 Lua（逐条比对后再 LSET），运行中若有新孢子进来会中止并提示重跑，不会写错位置。
- 结束后重新读一遍并报告还剩几条带 `text`（应为 0）。不动人口计数和其他键。
- 凭据：环境变量 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`，或仓库根目录的 `.env.local`（见 scripts/feedback-export/README.md）。
