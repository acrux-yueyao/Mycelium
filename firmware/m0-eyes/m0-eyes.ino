/**
 * MYCELIUM desk companion — M0 "eyes" firmware.
 *
 * Board:    ESP32 WROOM-32 devkit (bench) — same code runs on XIAO ESP32-S3
 *           with only the pin table changed.
 * Screens:  2× 0.96" SSD1306 128×64.
 *           TWO_BUS 1 (default): each screen gets its own I2C bus, so both
 *           can stay at the factory 0x3C — no address rework, no multiplexer.
 *           TWO_BUS 0: both on one bus, right screen strapped to 0x3D.
 * Optional: VL53L0X ToF on the same bus — the creature notices you.
 *
 * Wiring (bench):
 *   左眼 + ToF   SDA=21  SCL=22      (总线0)
 *   右眼         SDA=18  SCL=19      (总线1)
 *   3V3 + GND 两块屏和 ToF 都并上
 *
 * Behaviour — the same rules the site's creatures follow:
 *   - collective breath: everything scales ±2% on a ~7 s sine
 *   - saccades: the pupil picks a spot, eases there, holds, picks again
 *   - blinks: every 2–6 s, 15% chance of a double blink
 *   - presence: ToF < NEAR_MM → snaps awake and looks at you (eyes widen
 *     for a moment on the transition); < CLOSE_MM → happy squint
 *   - left alone 60 s → sleepy lids; wake on approach
 *
 * Serial (115200) mood test keys, for the future /api/emotion hookup:
 *   n neutral · h happy · z sleepy · s sad · a angry
 *   d 打印实时距离 · c 重新校准背景距离
 *
 * Libraries: Adafruit GFX, Adafruit SSD1306, (optional) Adafruit_VL53L0X.
 * Set USE_TOF 0 if the ToF library isn't installed yet.
 */
#define USE_TOF 1

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#if USE_TOF
#include "Adafruit_VL53L0X.h"
#endif

#define TWO_BUS 1     // 1 = 右眼走第二组 I2C(两块屏都是 0x3C,不用改地址)

constexpr int PIN_SDA = 21, PIN_SCL = 22;
constexpr int PIN_SDA2 = 18, PIN_SCL2 = 19;
constexpr uint8_t ADDR_L = 0x3C;
constexpr uint8_t ADDR_R = TWO_BUS ? 0x3C : 0x3D;

Adafruit_SSD1306 eyeL(128, 64, &Wire, -1);
#if TWO_BUS
Adafruit_SSD1306 eyeR(128, 64, &Wire1, -1);
#else
Adafruit_SSD1306 eyeR(128, 64, &Wire, -1);
#endif
#if USE_TOF
Adafruit_VL53L0X lox;
bool hasTof = false;
#endif

enum Mood { NEUTRAL, HAPPY, SLEEPY, SAD, ANGRY };
Mood mood = NEUTRAL;

// ---------- gaze ----------
float px = 0, py = 0;          // current pupil offset, -1..1
float tx = 0, ty = 0;          // saccade target
uint32_t nextSaccade = 0;

// ---------- blink ----------
uint32_t nextBlink = 2500;
uint32_t blinkStart = 0;
bool doubleBlink = false;

// ---------- presence ----------
// 灵敏度就调这三个数:发现距离 / 贴近距离 / 离开后多久算走了
constexpr int NEAR_MM  = 500;    // 50cm 以内 = 注意到你
constexpr int CLOSE_MM = 200;    // 20cm 以内 = 眯眼笑
constexpr uint32_t HOLD_MS = 700;      // 读数丢失后还认为"有人"的时间
constexpr uint32_t LONELY_MS = 20000;  // 没人多久之后开始打瞌睡

int rangeMM = 9999;
int bgMM = 9999;               // 开机量到的"背景距离"(桌面/墙)
int nearGate = NEAR_MM;        // 实际生效的发现阈值
uint32_t lastRangePoll = 0;
uint32_t lastPresence = 0;     // last time someone was near
uint32_t noticedAt = 0;        // 刚发现人的时刻 —— 用来做"一惊"的睁大
uint32_t leftAt = 0;           // 人刚走开的时刻 —— 用来做"目送"的垂眼
bool wasNear = false;
bool moodFromPresence = false; // 心情是不是因为有人才变的(走了要还回去)
bool debugRange = false;       // 串口按 d 打开距离打印
uint32_t lastDbg = 0;

float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

/** Blink envelope: 1 = open, 0 = shut. ~220 ms per blink. */
float blinkAmt(uint32_t now) {
  if (blinkStart == 0) return 1.0f;
  float t = (now - blinkStart) / 1000.0f;
  float dur = 0.22f;
  if (t >= dur) {
    if (doubleBlink) { doubleBlink = false; blinkStart = now + 90; }
    else blinkStart = 0;
    return 1.0f;
  }
  float ph = t / dur;                       // 0..1
  return ph < 0.45f ? 1.0f - ph / 0.45f     // closing
                    : (ph - 0.45f) / 0.55f; // opening
}

/**
 * Draw one eye. sign = -1 left screen, +1 right (mirrors lid slants).
 * The face language matches the site's spores: a lit rounded block for
 * the sclera, an unlit pupil that glances, lids as dark overlays.
 */
void drawEye(Adafruit_SSD1306 &d, int sign, float breath, float open_) {
  d.clearDisplay();

  int w = int(96 * breath), h = int(52 * breath * open_);
  int cx = 64, cy = 32;
  if (h < 6) {                       // fully shut: a soft line
    d.fillRoundRect(cx - w / 2, cy - 2, w, 4, 2, SSD1306_WHITE);
    d.display();
    return;
  }
  d.fillRoundRect(cx - w / 2, cy - h / 2, w, h, 10, SSD1306_WHITE);

  // pupil — an unlit square block, like the mosaic cells.
  // Both eyes share the same gaze vector; only the lids mirror.
  int pxp = cx + int(px * 24);
  int pyp = cy + int(py * 12);
  int pr = 11;
  d.fillRoundRect(pxp - pr, pyp - pr, pr * 2, pr * 2, 4, SSD1306_BLACK);

  // moods, as lid overlays
  if (mood == HAPPY) {
    // squint from below — the lower lid rises into an arc
    d.fillRoundRect(cx - w / 2 - 2, cy + h / 8, w + 4, h, 8, SSD1306_BLACK);
  } else if (mood == SLEEPY) {
    d.fillRect(cx - w / 2 - 2, cy - h / 2 - 2, w + 4, int(h * 0.45f), SSD1306_BLACK);
  } else if (mood == SAD) {
    // outer-high slanted upper lid
    for (int i = 0; i < w; i++) {
      int drop = int((sign > 0 ? i : (w - i)) * 0.28f);
      d.drawFastVLine(cx - w / 2 + i, cy - h / 2, drop, SSD1306_BLACK);
    }
  } else if (mood == ANGRY) {
    // inner-low slanted upper lid
    for (int i = 0; i < w; i++) {
      int drop = int((sign > 0 ? (w - i) : i) * 0.30f);
      d.drawFastVLine(cx - w / 2 + i, cy - h / 2, drop, SSD1306_BLACK);
    }
  }
  d.display();
}

#if USE_TOF
/** 开机(或串口按 c)量一遍背景:传感器可能正对桌面或墙,
 *  那样绝对阈值永远成立,人走了也判断不出来。改成"比背景近多少"。 */
void calibrate() {
  int v[24], n = 0;
  uint32_t t0 = millis();
  while (n < 24 && millis() - t0 < 1200) {
    if (lox.isRangeComplete()) {
      int r = lox.readRangeResult();
      if (r > 0 && r < 8000) v[n++] = r;
    }
    delay(15);
  }
  if (n < 5) { bgMM = 9999; nearGate = NEAR_MM; }
  else {
    for (int i = 1; i < n; i++)              // 插入排序取中位数,抗跳变
      for (int j = i; j > 0 && v[j] < v[j-1]; j--) { int t = v[j]; v[j] = v[j-1]; v[j-1] = t; }
    bgMM = v[n / 2];
    // 背景比 NEAR_MM 还近 → 门限压到背景前面 120mm
    nearGate = (bgMM < NEAR_MM + 120) ? max(80, bgMM - 120) : NEAR_MM;
  }
  Serial.printf("背景 %d mm → 发现门限 %d mm(按 c 可重新校准)\n", bgMM, nearGate);
}
#endif

void setup() {
  Serial.begin(115200);
  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(400000);
#if TWO_BUS
  Wire1.begin(PIN_SDA2, PIN_SCL2);
  Wire1.setClock(400000);
#endif

  bool okL = eyeL.begin(SSD1306_SWITCHCAPVCC, ADDR_L);
  bool okR = eyeR.begin(SSD1306_SWITCHCAPVCC, ADDR_R);
  Serial.printf("eye L(0x%02X @bus0)=%d  eye R(0x%02X @bus%d)=%d\n",
                ADDR_L, okL, ADDR_R, TWO_BUS ? 1 : 0, okR);

#if USE_TOF
  hasTof = lox.begin();
  Serial.printf("ToF VL53L0X=%d\n", hasTof);
  if (hasTof) { lox.startRangeContinuous(33); calibrate(); }
#endif
  randomSeed(esp_random());
}

void loop() {
  uint32_t now = millis();

  // --- presence ---
#if USE_TOF
  if (hasTof && now - lastRangePoll > 20) {
    lastRangePoll = now;
    if (lox.isRangeComplete()) {
      int r = lox.readRangeResult();
      if (r > 0 && r < 8000) rangeMM = r;      // 8190 = 超量程,丢掉
    }
    if (rangeMM > 0 && rangeMM < nearGate) lastPresence = now;
  }
  if (debugRange && now - lastDbg > 250) {
    lastDbg = now;
    Serial.printf("距离 %4d mm  %s\n", rangeMM,
                  rangeMM < CLOSE_MM ? "贴近" : (rangeMM < nearGate ? "有人" : "空"));
  }
#endif
  bool someoneNear  = (now - lastPresence) < HOLD_MS && lastPresence != 0;
  bool someoneClose = someoneNear && rangeMM < CLOSE_MM;
  bool lonely       = (now - lastPresence) > LONELY_MS;
  if (someoneNear && !wasNear) {                 // 从"没人"变"有人"的那一瞬
    noticedAt = now;
    Serial.println("→ 有人");
  }
  if (!someoneNear && wasNear) {                 // 从"有人"变"没人"
    leftAt = now;
    Serial.println("→ 走了");
  }
  wasNear = someoneNear;
  bool startled = someoneNear && (now - noticedAt) < 450;
  bool justLeft = leftAt != 0 && (now - leftAt) < 1000;

  // --- serial mood keys (stand-in for /api/emotion) ---
  while (Serial.available()) {
    switch (Serial.read()) {
      case 'n': mood = NEUTRAL; break;
      case 'h': mood = HAPPY;   break;
      case 'z': mood = SLEEPY;  break;
      case 's': mood = SAD;     break;
      case 'a': mood = ANGRY;   break;
      case 'd': debugRange = !debugRange;
                Serial.printf("[距离打印 %s]\n", debugRange ? "开" : "关"); break;
#if USE_TOF
      case 'c': if (hasTof) { Serial.println("[重新校准背景,手离开传感器]");
                              delay(600); calibrate(); } break;
#endif
    }
  }
  // presence overrides idle moods —— 人走了必须把心情还原,否则笑脸会一直挂着
  if (someoneClose) { mood = HAPPY; moodFromPresence = true; }
  else if (moodFromPresence && !someoneNear) { mood = NEUTRAL; moodFromPresence = false; }
  else if (lonely && mood == NEUTRAL) mood = SLEEPY;
  else if (!lonely && mood == SLEEPY && someoneNear) mood = NEUTRAL;

  // --- saccades ---
  if (someoneNear) { tx = 0; ty = 0.15f; nextSaccade = now + 600; }
  else if (justLeft) { tx = 0; ty = -0.45f; nextSaccade = now + 1000; }  // 目送:视线垂下
  else if (now > nextSaccade) {
    tx = (random(200) - 100) / 100.0f * 0.8f;
    ty = (random(200) - 100) / 100.0f * 0.5f;
    nextSaccade = now + 1500 + random(2500);
  }
  // 被发现的瞬间视线猛地对过来,平时慢慢飘
  float ease = startled ? 0.45f : 0.18f;
  px += (tx - px) * ease;
  py += (ty - py) * ease;

  // --- blinks ---
  if (now > nextBlink && blinkStart == 0) {
    blinkStart = now;
    doubleBlink = random(100) < 15;
    nextBlink = now + 2000 + random(4000) + (mood == SLEEPY ? 2500 : 0);
  }
  float open_ = blinkAmt(now);
  if (mood == SLEEPY) open_ *= 0.72f;
  if (startled) open_ *= 1.18f;          // 一惊:眼睛睁大半秒
  if (justLeft)  open_ *= 0.80f;         // 目送:眼皮垂一秒

  // --- collective breath, the 7 s sine every creature shares ---
  float breath = 1.0f + 0.02f * sinf(now / 7000.0f * TWO_PI);

  drawEye(eyeL, -1, breath, open_);
  drawEye(eyeR, +1, breath, open_);

  delay(16); // ~30 fps across both screens at 400 kHz I2C
}
