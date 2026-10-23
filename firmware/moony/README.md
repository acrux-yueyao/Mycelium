# Moony 固件 · 眼睛 + 耳朵 + 声音

在 `m0-eyes` 的基础上加了麦克风、喇叭和「摸头说话」。主板 MC03-F + XIAO ESP32-S3。

## 它会做什么

| 你做什么 | Moony 怎么回应 |
|---|---|
| 摸一下头（短按） | 「啾」一声，眯眼笑 |
| **按住头顶说话**，说完松手 | 眼睛往上看（在听）→ 眼珠转圈（在想）→ 回应 |
| 说口令 hello / sleep / wake up / look at me / dance / sing | 打招呼、闭眼睡觉、醒来、盯着你、跳舞、唱一段 |
| 说别的话 | 不用人话回答：用那句话的情绪家族换表情，唱一段**属于那句话**的旋律（同一句话唱同一段） |
| 一分钟没人以后有人走近 | 三个音的「重逢」小曲 |
| 拍手、突然很响 | 吓一跳，眼睛睁大 |
| 拿起来晃 / 倒过来 | 生气 / 晕 |
| 连不上热点或塔 | 照样眨眼、看人、被摸会笑；说话时只「嗯？」一下 |

睡着以后只有**摸它**或说「wake up」才会醒，走过的人不会吵醒它。

六个家族的旋律：tender 温暖慢板 · calm 低沉长音 · curious 明亮跳跃（断奏）· dreamy 全音阶飘浮带回声 · companion 三度和声 · lonely 小调往下沉。

## 烧录

1. 打开 `moony_config.h`，填上：
   - 手机热点的 `WIFI_SSID` / `WIFI_PASS`
   - Pi 的 `PI_HOSTNAME` / `PI_IP`（见 `scripts/moony-listen/README.md`）
   - 说话用的触摸电极 `TALK_ELECTRODES`（默认 E0）
2. Arduino IDE：开发板 **XIAO_ESP32S3**，USB CDC On Boot **Enabled**，**PSRAM: OPI PSRAM**（要开，不然录音只有 3 秒）。
   arduino-cli：`--fqbn esp32:esp32:XIAO_ESP32S3:CDCOnBoot=default,PSRAM=opi`
3. 库：Adafruit GFX、Adafruit SSD1306、Adafruit_VL53L0X（和 m0-eyes 一样）。
4. 上传。开机会「叮」一声。

## 串口（115200）

- `1`–`6`：直接播放六个家族的旋律（不用联网，先听听喇叭）
- `i`：状态（Wi-Fi、Pi 地址、触摸、麦克风音量、当前动作）
- `p`：重新找 Pi
- `d`：打印距离和麦克风音量
- `t`：触摸监视。每 0.25 秒打印 12 路的信号 `E0:  3 …`，摸到的那路数字变大并带 `*`，同时打印「摸到: E3」。再按 `t` 关
- `c`：重新校准测距背景
- `n` / `h` / `z` / `s` / `a`：手动切表情

## 测试顺序

1. **不联网：** 按 `1`–`6` 听旋律；摸 E0 短按听「啾」；拍手看眼睛睁大。
2. **连上热点：** 串口出现「Wi-Fi 已连上」；按 `p` 能解析到 Pi。
3. **Pi 上跑 `moony_listen.py --debug`：** 按住 E0 说「hello」，Pi 打印转写，Moony 唱上行琶音。
4. **说一句心情：** 比如「I miss my family」，Pi 打印 `reading lonely …`，Moony 换表情、唱小调。

> 我这边没法编译 ESP32，只在电脑上用模拟的 Arduino 头文件做过语法和旋律检查。第一次编译如果有报错，把报错贴回来就行。
