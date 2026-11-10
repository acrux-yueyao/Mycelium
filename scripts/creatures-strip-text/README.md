# 清除孢子记录里的原句

一次性脚本：把 Upstash 里 `mycelium:creatures` 每条记录的 `text`（访客低语的原句）删掉，只留长成的形状——情绪标签、形态参数、名字、编号、时间。删之前先按原句算出编号 `myc`（和样本卡上显示的 MYC-… 一致）写回记录，这样原句没了编号也不变；`rationale` 若复述了原句（整句，或连续 3 个词 / 字），也一并去掉。判断逻辑在 `plan.mjs`，脚本只负责读写。

```bash
node scripts/creatures-strip-text/strip-text.mjs            # 只看会改多少条，不写任何东西
node scripts/creatures-strip-text/strip-text.mjs --apply    # 先备份到仓库外，再改
```

- 备份默认写到 `~/mycelium-raw-export/creatures-raw-<时间>.json`，可用 `--backup 路径` 指定；路径在仓库内会拒绝。备份含原句，不要提交、用完请自行处置。
- 改写是一条原子 Lua（逐条比对后再 LSET），运行中若有新孢子进来会中止并提示重跑，不会写错位置。
- 结束后重新读一遍并报告还剩几条带 `text`（应为 0）。不动人口计数和其他键。
- 凭据：环境变量 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`，或仓库根目录的 `.env.local`（见 scripts/feedback-export/README.md）。

## 2026-11-10 已执行

线上 52 条记录里 51 条带原句，全部清除（其中 1 条的 `rationale` 复述了原句，一并去掉）；清理后 0 条带 `text`，51 条补上了 `myc`。Upstash 凭据在 Vercel 上是拉不到本地的 Secret，所以这次没有用本脚本的读写部分，而是把 `plan.mjs` 放进一次性的 Preview 部署里跑（只返回条数，一次性密钥，跑完即删部署）；备份取自清理前的线上 GET，存在仓库外。以后本地有凭据时直接用本脚本即可。
