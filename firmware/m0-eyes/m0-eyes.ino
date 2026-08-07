/**
 * MYCELIUM desk companion — M0 "eyes" firmware.
 *
 * Board:    ESP32 WROOM-32 devkit (bench) — same code runs on XIAO ESP32-S3
 *           with only the pin table changed.
 * Screens:  2× 0.96" SSD1306 128×64, both on I2C — left eye 0x3C, right 0x3D.
 *           (If your batch is fixed at 0x3C, put a TCA9548A between them and
 *           wrap the draw calls in channel selects.)
 * Optional: VL53L0X ToF on the same bus — the creature notices you.
 *
 * Wiring (bench pin table from drawing MC-01 v1.3):
 *   SDA=21  SCL=22  ·  3V3 + GND to both screens (+ ToF)
 *
 * Behaviour — the same rules the site's creatures follow:
 *   - collective breath: everything scales ±2% on a ~7 s sine
 *   - saccades: the pupil picks a spot, eases there, holds, picks again
 *   - blinks: every 2–6 s, 15% chance of a double blink
 *   - presence: ToF < 350 mm → look at you; < 120 mm → happy squint
 *   - left alone 60 s → sleepy lids; wake on approach
 *
 * Serial (115200) mood test keys, for the future /api/emotion hookup:
 *   n neutral · h happy · z sleepy · s sad · a angry
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

constexpr int PIN_SDA = 21, PIN_SCL = 22;
constexpr uint8_t ADDR_L = 0x3C, ADDR_R = 0x3D;

Adafruit_SSD1306 eyeL(128, 64, &Wire, -1);
Adafruit_SSD1306 eyeR(128, 64, &Wire, -1);
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
int rangeMM = 9999;
uint32_t lastRangePoll = 0;
uint32_t lastPresence = 0;     // last time someone was near

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

void setup() {
  Serial.begin(115200);
  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(400000);

  bool okL = eyeL.begin(SSD1306_SWITCHCAPVCC, ADDR_L);
  bool okR = eyeR.begin(SSD1306_SWITCHCAPVCC, ADDR_R);
  Serial.printf("eye L(0x3C)=%d  eye R(0x3D)=%d\n", okL, okR);

#if USE_TOF
  hasTof = lox.begin();
  Serial.printf("ToF VL53L0X=%d\n", hasTof);
  if (hasTof) lox.startRangeContinuous(120);
#endif
  randomSeed(esp_random());
}

void loop() {
  uint32_t now = millis();

  // --- presence ---
#if USE_TOF
  if (hasTof && now - lastRangePoll > 120) {
    lastRangePoll = now;
    if (lox.isRangeComplete()) rangeMM = lox.readRangeResult();
    if (rangeMM > 0 && rangeMM < 350) lastPresence = now;
  }
#endif
  bool someoneNear  = (now - lastPresence) < 1200 && lastPresence != 0;
  bool someoneClose = someoneNear && rangeMM < 120;
  bool lonely       = (now - lastPresence) > 60000;

  // --- serial mood keys (stand-in for /api/emotion) ---
  while (Serial.available()) {
    switch (Serial.read()) {
      case 'n': mood = NEUTRAL; break;
      case 'h': mood = HAPPY;   break;
      case 'z': mood = SLEEPY;  break;
      case 's': mood = SAD;     break;
      case 'a': mood = ANGRY;   break;
    }
  }
  // presence overrides idle moods
  if (someoneClose) mood = HAPPY;
  else if (lonely && mood == NEUTRAL) mood = SLEEPY;
  else if (!lonely && mood == SLEEPY && someoneNear) mood = NEUTRAL;

  // --- saccades ---
  if (someoneNear) { tx = 0; ty = 0.15f; nextSaccade = now + 600; }
  else if (now > nextSaccade) {
    tx = (random(200) - 100) / 100.0f * 0.8f;
    ty = (random(200) - 100) / 100.0f * 0.5f;
    nextSaccade = now + 1500 + random(2500);
  }
  px += (tx - px) * 0.18f;
  py += (ty - py) * 0.18f;

  // --- blinks ---
  if (now > nextBlink && blinkStart == 0) {
    blinkStart = now;
    doubleBlink = random(100) < 15;
    nextBlink = now + 2000 + random(4000) + (mood == SLEEPY ? 2500 : 0);
  }
  float open_ = blinkAmt(now);
  if (mood == SLEEPY) open_ *= 0.72f;

  // --- collective breath, the 7 s sine every creature shares ---
  float breath = 1.0f + 0.02f * sinf(now / 7000.0f * TWO_PI);

  drawEye(eyeL, -1, breath, open_);
  drawEye(eyeR, +1, breath, open_);

  delay(16); // ~30 fps across both screens at 400 kHz I2C
}
