# MC03-F 脸板调试交接(2026-10-17)

给接手调试的会话:这块板是 Moony 机器人的主板。下面是到目前为止的全部状态、已知问题和下一步。
设计细节以 `hardware/SCHEMATIC.md` 为准,生成器是 `hardware/pcb/facebrd_gen.py`。

## 1 · 板子是什么

- MC03-F v1,2 层,0.8 mm,56 × 68 mm,顶边中央有缺口给 XIAO。所有元件在正面。
- 嘉立创贴片:U2 MPR121QR2(UQFN-20 3×3 0.4 mm)、U3 MPU-6050、R1–R5、C1–C9、全部连接器。
- 自己焊:U1 XIAO ESP32-S3(邮票孔平贴)、J2 麦克风 6 孔、J7 触摸 12 孔、TP2/TP3 电池线。

### XIAO 焊盘(正面朝上、USB-C 朝缺口/顶边)

| 行 | 左列 | 右列 |
|---|---|---|
| 1 | D0 = SDA1 | 5V(VBUS,旁边小方焊盘 TP1) |
| 2 | D1 = I2S LRC | GND |
| 3 | D2 = I2S BCLK | 3V3 |
| 4 | D3 = I2S DIN | D10 = MIC SD |
| 5 | D4 = **SDA0** | D9 = MIC WS |
| 6 | D5 = **SCL0** | D8 = MIC SCK |
| 7 | D6 = LED DIN | D7 = SCL1 |

ESP32-S3 GPIO:D0=1, D1=2, D2=3, D3=4, D4=5, D5=6, D6=43, D7=44, D8=7, D9=8, D10=9。

### 总线与地址

- 总线 0(D4/D5):左眼屏 0x3C(J3)· ToF 0x29(J1)· **MPU-6050 0x68(板上)· MPR121 0x5A(板上)**
- 总线 1(D0/D7):右眼屏 0x3C(J3,独占)
- 上拉:R1–R4 = 4.7 kΩ 到 3V3(SDA0/SCL0/SDA1/SCL1 各一个)。R5 = 75 kΩ 是 MPR121 的 REXT。
- MPR121 IRQ 没接,固件轮询。ADDR 经芯片正下方的过孔接地。

### 其他测试点

- JP1(左下):三个焊盘,左 = 3V3,中 = 功放供电,右 = VBAT;出厂铜线连好 1-2。
- TP2(缺口下方左方孔)= BAT+ / VBAT;TP3(右方孔)= BAT− / GND。
- 四个角的金色安装孔环 = GND。

## 2 · 已经做完的

1. 工厂件外观:U2 丝印 `263 M121 TYC`、U3 `MPU-6050`,方向都对,照片上无连锡。R1–R4 = 472,R5 = 753。
2. 焊 XIAO 前蜂鸣挡:3V3↔GND、VBAT↔GND、5V↔GND、SDA0↔SCL0、SDA1↔SCL1 全部不响。
3. XIAO 已焊上,方向正确(TP1 露在右上角外)。
4. 插 USB:JP1 的 3V3 焊盘对地 **3.27 V**,芯片不烫。
5. 电脑环境(用户的 Mac):Arduino IDE + esp32 板包 3.3.11;XIAO 出现在 `/dev/cu.usbmodem1101`;FQBN `esp32:esp32:XIAO_ESP32S3:CDCOnBoot=default`;草图在 `~/Documents/Arduino/bench-check/`。上传成功。之前识别不到是数据线/扩展坞的问题,换线直插就好了。

## 3 · 当前问题:总线 0 扫不到板上的两颗芯片

旧版 `bench-check` 输出两条总线都是 `(空)`。只焊了 XIAO、还没接任何模块时,总线 0 **应该**扫到 0x5A 和 0x68;总线 1 空是正常的。

旧版打印的 `SDA=G21 SCL=G22` 是写死的文字,不代表实际脚位。

### 已推送的新版 bench-check(分支 `claude/fix-build-error-fovEy`,commit 46d3fc9)

`https://raw.githubusercontent.com/acrux-yueyao/Mycelium/claude/fix-build-error-fovEy/firmware/bench-check/bench-check.ino`

新增:
- 打印板型(确认 `ARDUINO_XIAO_ESP32S3` 生效)和实际 GPIO 编号(总线 0 应为 GPIO5/6,总线 1 应为 GPIO1/44)。
- 上电时对四根 I2C 线做上拉自检:脚位设 INPUT_PULLDOWN,读到 HIGH = 焊点通、4.7k 上拉在;LOW = 虚焊或上拉没电。
- 注意:这一版**还没编译过**(云端没有 ESP32 工具链)。编译报错就就地修。

### 排查顺序

1. 上传新版,读串口 115200。
2. 板型不是 XIAO → 重新选 FQBN。
3. SDA0 或 SCL0 = LOW → XIAO 左列第 5 / 第 6 个焊点虚焊。补焊:烙铁贴邮票孔和板上焊盘交界,加锡停 2–3 秒让锡流到 XIAO 下面的焊盘。补完复测。
   - 万用表复核(断电、蜂鸣挡):左列第 5 焊点 ↔ R1 两端之一应响;左列第 6 ↔ R2 两端之一应响。
4. 四根都 HIGH 但仍扫不到 → 焊点 OK,查芯片侧:
   - 3V3 是否到了 U2/U3:量 C1–C9 两端(去耦电容一端 3V3 一端 GND)应约 3.3 V。
   - U2 ADDR 过孔接地是否可靠(扫 0x5A–0x5D 任一出现都说明 MPR121 活着、只是地址浮动)。可把扫描范围已经覆盖 1–126,看有没有"未知设备"。
   - 把 I2C 降到 10 kHz 再扫(`Wire.setClock(10000)`)。
   - 只扫到 0x68 没有 0x5A → MPR121 焊接(0.4 mm 间距)可疑,拍微距照片。只扫到 0x5A 没有 0x68 → 查 MPU 的 VLOGIC / AD0。
5. 总线 0 两颗都出现后再进入第 4 节。

## 4 · 之后的步骤(SCHEMATIC.md §5)

1. 插 J3 双屏、ToF 模块贴在板正面框里插 J1 → bench-check:总线 0 报 0x3C·0x29·0x68·0x5A,总线 1 报 0x3C。`TEST_SCREEN 1` 让两屏各显示 L / R(需要 Adafruit_SSD1306 + Adafruit_GFX)。
2. INMP441 贴在板正面框里,6 根短线焊 J2(顺序 L/R·WS·SCK·SD·VDD·GND,同模块丝印;**L/R 接 GND**)。功放 MAX98357A 插 J6 → `firmware/bench-audio`:喇叭播音阶,串口音量条随说话跳。
3. `firmware/m0-eyes`:眼睛呼吸、扫视、眨眼;ToF 近了盯人;已接 MPR121 和 MPU。需要 Adafruit_VL53L0X(没有就 `USE_TOF 0`)。
4. 触摸:J7 的 E0–E11 细线焊到触摸方块铜箔(规划见 `hardware/TOUCH.md`)。
5. 电池:XIAO 背面 BAT+ / BAT− 各焊一根 28AWG,从缺口穿到板背面,**红线 BAT+ → TP2(左),黑线 BAT− → TP3(右)**。焊前用蜂鸣挡确认 TP3↔GND 响、TP2↔GND 不响。接反会烧 XIAO。然后 J4 插 603040 电池、J8 接 TP4057 充电板,拔 USB 看能否电池供电。

## 5 · 时间

BU Art Market:2026-10-30(周五)12–5 PM,808 Commonwealth Ave。目标是机器人能在展位上出现,至少眼睛 + ToF + 触摸能动。

## 6 · 用户的工具

AstroAI AM33D 万用表(蜂鸣挡在 200 和 OUT 之间的 ▶|•))) 格;电压用 V⎓ 20)。电烙铁、焊锡。3 块 XIAO ESP32-S3,5 片裸板 + 4 片贴好的板。

## 7 · XIAO 14 个焊点全检表(断电,Ω 200 或蜂鸣挡)

表笔一头碰 XIAO 侧面的焊点,另一头碰"去向点";应接近 0 Ω / 响。坐标:板正面朝上、缺口朝上。

| XIAO 焊点 | 网络 | 去向点(任选其一) |
|---|---|---|
| 左1 D0 | SDA1 | EYES 座右侧第 5 根脚 · R3 左端 |
| 左2 D1 | I2S LRC | AMP 座上方第 4 根脚(从左数) |
| 左3 D2 | I2S BCLK | AMP 座上方第 3 根脚 |
| 左4 D3 | I2S DIN | AMP 座上方第 5 根脚(最右) |
| 左5 D4 | SDA0 | EYES 第 3 根脚 · R1 左端 · ToF 座从上数第 3 根 |
| 左6 D5 | SCL0 | EYES 第 4 根脚 · R2 左端 · ToF 座最上一根 |
| 左7 D6 | LED DIN | LED 座上方第 3 根脚(最右) |
| 右1 | 5V | 右上角小方焊盘 TP1 |
| 右2 | GND | 任一金色安装孔环 |
| 右3 | 3V3 | EYES 第 1 根脚 · C1 左端 · JP1 左焊盘 |
| 右4 D10 | MIC SD | J2 从上数第 4 个孔 |
| 右5 D9 | MIC WS | J2 第 2 个孔 |
| 右6 D8 | MIC SCK | J2 第 3 个孔 |
| 右7 D7 | SCL1 | EYES 第 6 根脚(最下) · R4 下端 |

EYES 座 6 根脚从上到下:3V3 · GND · SDA0 · SCL0 · SDA1 · SCL1。J2 六孔从上(方孔)到下:GND · WS · SCK · SD · 3V3 · GND。
相邻焊点之间(每列 6 对,共 12 对)都不应响;刚碰上"嘀"一下就停是电容充电,正常。
