# moony-listen · Moony 的耳朵（跑在塔的 Raspberry Pi 5 上）

Moony 被摸着头说话时，自己用麦克风录几秒，发到这里。这个服务在 Pi 上**本地**把声音转成文字（faster-whisper），然后：

- **是口令** → 告诉 Moony 做什么。口令：hello / sleep / good night / wake up / look at me / dance / sing，中文的 你好 / 睡觉 / 晚安 / 醒醒 / 看我 / 跳舞 / 唱歌 也认。**不需要互联网**，只要 Moony 和 Pi 在同一个热点上。
- **不是口令** → 只把文字发给网站的 `/api/emotion`，就是塔用的同一个读取：Claude 只读，不回答。拿回情绪家族和几个数，Moony 用眼神和一段旋律回应。

声音不出 Pi、不存盘；文字不打印、不保存，也不会回传给 Moony。`--debug` 只在家里测试时用，会把转写打印出来。

## 安装（在家里做，需要联网下载一次模型）

```bash
cd ~/Mycelium/scripts/moony-listen
python3 -m venv .venv
.venv/bin/pip install faster-whisper numpy
.venv/bin/python moony_listen.py --debug        # 第一次运行会下载 whisper "base" 模型（约 150 MB）
```

看到 `listening on :8766` 就好了。另开一个终端测试：`curl http://localhost:8766/`，应返回 `{"ok": true, ...}`。

模型选择：`--model tiny`（最快，听错多）· `base`（默认）· `small`（更准，Pi 5 上每句要 3–5 秒）。

## 开机自动运行

```bash
sudo cp moony-listen.service /etc/systemd/system/
sudo systemctl enable --now moony-listen
journalctl -u moony-listen -f        # 看日志：只会出现 "command sleep" / "reading dreamy 0.6" 这种
```

`moony-listen.service` 默认用户是 `pi`、仓库在 `/home/pi/Mycelium`。不一样的话先改文件里那两处。

## Moony 怎么找到 Pi

Moony 先找 `tower.local`（mDNS），找不到就用 `moony_config.h` 里的 `PI_IP`。

- Pi 的主机名：`hostname` 命令查看。不是 `tower` 的话，改 `moony_config.h` 的 `PI_HOSTNAME`。
- Pi 在热点下的 IP：`hostname -I` 查看。iPhone 热点一般是 `172.20.10.x`。

## 接口

```
POST /hear   body = 16 kHz 16-bit 单声道 PCM（小端），header X-Rate: 16000
  → {"kind":"command","cmd":"sleep"}
  → {"kind":"reading","family":3,"label":"dreamy","intensity":0.62,"agitation":0.3,"glow":0.55,"hue":268}
  → {"kind":"none"}       没听到/没听懂
  → {"kind":"offline"}    听懂了但连不上 /api/emotion（热点没流量）
GET /        → {"ok": true, "model": "base"}
```
