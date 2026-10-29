/**
 * MYCELIUM desk companion — "Moony" firmware (eyes + ears + voice).
 *
 * Builds on m0-eyes (two OLED eyes, ToF presence, MPR121 touch, MPU6050
 * tilt) and adds the sound side of the MC03-F face board:
 *
 *   - hold the top of the head (TALK_ELECTRODES) and speak: Moony records
 *     with its own INMP441 mic, sends the audio to the tower Pi
 *     (scripts/moony-listen), which turns it into text locally and either
 *       · recognises an offline command  — hello / sleep / wake up /
 *         look at me / dance / sing — and Moony acts it out, or
 *       · asks /api/emotion for a reading (Claude reads, never answers),
 *         and Moony replies without words: eyes in that family's mood and
 *         a short melody that belongs to that sentence (same family, same
 *         intensity → same tune), like the tower's spores singing.
 *   - a pat (short touch) → a little chirp + happy squint
 *   - someone comes back after Moony was alone → a three-note reunion chime
 *   - a sharp loud sound (clap) → startled eyes
 *   - no network → it still lives (eyes, touch, presence); talking gets a
 *     puzzled "hm?" instead of an answer.
 *
 * Board: XIAO ESP32-S3 on MC03-F. Arduino core esp32 3.3.x.
 *   Tools → Board: XIAO_ESP32S3 · USB CDC On Boot: Enabled · PSRAM: OPI PSRAM
 *   FQBN:  esp32:esp32:XIAO_ESP32S3:CDCOnBoot=default,PSRAM=opi
 * Libraries: Adafruit GFX, Adafruit SSD1306, Adafruit_VL53L0X.
 * Settings (Wi-Fi, Pi address, talk electrode): moony_config.h
 *
 * Serial 115200 keys: n/h/z/s/a moods · d distance · i status · c recalibrate
 *   1..6 play a family melody · p ping the Pi
 */
#define USE_TOF 1

#include <Wire.h>
#include <WiFi.h>
#include <ESPmDNS.h>
#include <HTTPClient.h>
#include <driver/i2s.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#if USE_TOF
#include "Adafruit_VL53L0X.h"
#endif
#include "moony_config.h"

// ===================== pins (MC03-F) =====================
#if defined(ARDUINO_XIAO_ESP32S3)
constexpr int PIN_SDA = D4, PIN_SCL = D5;        // bus 0: left eye, ToF, MPU, MPR121
constexpr int PIN_SDA2 = D0, PIN_SCL2 = D7;      // bus 1: right eye
constexpr int MIC_SCK = D8, MIC_WS = D9, MIC_SD = D10;
constexpr int AMP_BCLK = D2, AMP_LRC = D1, AMP_DIN = D3;
#else
constexpr int PIN_SDA = 21, PIN_SCL = 22;
constexpr int PIN_SDA2 = 18, PIN_SCL2 = 19;
constexpr int MIC_SCK = 14, MIC_WS = 15, MIC_SD = 32;
constexpr int AMP_BCLK = 26, AMP_LRC = 25, AMP_DIN = 27;
#endif

Adafruit_SSD1306 eyeL(128, 64, &Wire, -1);
Adafruit_SSD1306 eyeR(128, 64, &Wire1, -1);
#if USE_TOF
Adafruit_VL53L0X lox;
bool hasTof = false;
bool tofBlind = false;   // window wall in the sensor's view: it only ever sees that wall → ignore it
#endif

float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

// =====================================================================
//  AUDIO — one task on core 0 owns both I2S ports: plays note lists,
//  records while asked, and otherwise keeps a running mic level.
// =====================================================================
constexpr int SR = 16000;
constexpr i2s_port_t PORT_AMP = I2S_NUM_0;
constexpr i2s_port_t PORT_MIC = I2S_NUM_1;

// One vocalisation. hz 0 = rest. The pitch glides hz → hzMid (at midAt) → hzEnd (0 = hold).
// hz2 = a second voice in harmony. env 0 = swell (rise, hold, fade), 1 = pluck (snap, decay);
// aMs/bMs override its attack and fade/decay (0 = from the voice). soft muffles the upper
// harmonics; flutter/breath scale the voice's buzz and breath; warble wobbles the pitch.
struct Note {
  float hz; float hz2; uint16_t ms; float vol;
  float hzMid = 0, hzEnd = 0, midAt = 0.5f;
  uint8_t env = 0; uint16_t aMs = 0, bMs = 0;
  float soft = 0, flutter = 1, breath = 1, warble = 0, flHz = 0;
};
constexpr int MAX_NOTES = 32;
Note playList[MAX_NOTES];
volatile int playLen = 0;
volatile bool playReq = false;
volatile bool playing = false;
volatile float playingHz = 0;        // what's sounding now (eyes follow it)

int16_t *recBuf = nullptr;
size_t recCap = 0;                   // samples
volatile size_t recLen = 0;
volatile bool recording = false;
volatile int micLevel = 0;           // recent peak (same scale as bench-audio)

void setupAmp() {
  i2s_config_t cfg = {};
  cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX);
  cfg.sample_rate = SR;
  cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT;
  cfg.channel_format = I2S_CHANNEL_FMT_ONLY_LEFT;
  cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  cfg.dma_buf_count = 8;
  cfg.dma_buf_len = 256;
  cfg.tx_desc_auto_clear = true;     // underrun → silence. Without it the DMA keeps looping the last
                                     // ~130 ms of the previous sound: a "da-da-da" ticking after every tune
  i2s_pin_config_t pins = {};
  pins.mck_io_num = I2S_PIN_NO_CHANGE;
  pins.bck_io_num = AMP_BCLK;
  pins.ws_io_num = AMP_LRC;
  pins.data_out_num = AMP_DIN;
  pins.data_in_num = I2S_PIN_NO_CHANGE;
  i2s_driver_install(PORT_AMP, &cfg, 0, NULL);
  i2s_set_pin(PORT_AMP, &pins);
  i2s_zero_dma_buffer(PORT_AMP);
}

void setupMic() {
  i2s_config_t cfg = {};
  cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX);
  cfg.sample_rate = SR;
  cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT;   // INMP441: 24-bit in 32-bit frames
  cfg.channel_format = I2S_CHANNEL_FMT_ONLY_LEFT;    // L/R tied to GND = left
  cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  cfg.dma_buf_count = 8;
  cfg.dma_buf_len = 256;
  i2s_pin_config_t pins = {};
  pins.mck_io_num = I2S_PIN_NO_CHANGE;
  pins.bck_io_num = MIC_SCK;
  pins.ws_io_num = MIC_WS;
  pins.data_out_num = I2S_PIN_NO_CHANGE;
  pins.data_in_num = MIC_SD;
  i2s_driver_install(PORT_MIC, &cfg, 0, NULL);
  i2s_set_pin(PORT_MIC, &pins);
}

// ---------- Moony's voice ----------
// A seeded creature voice (the idea follows Pollen Robotics' Microduck): 7 harmonics on a
// gliding pitch, vibrato, a little jitter, a fast amplitude buzz ("flutter") and breath.
// These are voice no. 1 (seed 3) from scripts/moony-voice/voice.py — audition there first.
constexpr float V_PITCH = 349.7f, V_SPREAD = 0.642f, V_TILT = 2.381f, V_BRIGHT = 0.254f, V_NASAL = 0.166f;
constexpr float V_VIB_HZ = 5.73f, V_VIB_ST = 0.266f, V_JIT_ST = 0.065f, V_BREATH = 0.138f;
constexpr float V_FLUTTER = 0.213f, V_FL_HZ = 29.8f, V_ATTACK = 0.517f, V_SPEED = 0.996f;
constexpr int V_HARM = 7;
float vHarm[V_HARM];
uint32_t aRng = 0x1234567u;          // audio task's own noise source
float aRand() { aRng = aRng * 1664525u + 1013904223u; return (aRng >> 8) * (2.0f / 16777216.0f) - 1.0f; }

void voiceInit() {
  for (int k = 1; k <= V_HARM; k++) {
    float w = 1.0f / powf(k, V_TILT) + V_BRIGHT * powf((float)k / V_HARM, 1.5f) + ((k == 2 || k == 3) ? V_NASAL * 0.5f : 0);
    vHarm[k - 1] = w;
  }
  if (vHarm[0] < 0.7f) vHarm[0] = 0.7f;
}

/** Sum of harmonics at phase x via the sine recurrence; skips any above ~7 kHz (no aliasing). */
inline float harmSum(float x, float f, const float *w) {
  float s1 = sinf(x), c2 = 2.0f * cosf(x), prev = 0, cur = s1, out = 0;
  for (int k = 0; k < V_HARM; k++) {
    if ((k + 1) * f > 7000.0f) break;
    out += w[k] * cur;
    float nxt = c2 * cur - prev; prev = cur; cur = nxt;
  }
  return out;
}

void renderNote(const Note &n) {
  const int N = 256;
  int16_t buf[N];
  size_t wrote;
  float dur = n.ms / 1000.0f / V_SPEED;
  int total = (int)(dur * SR);
  if (n.hz <= 0) {                                  // rest
    playingHz = 0;
    memset(buf, 0, sizeof(buf));
    for (int done = 0; done < total; done += N) i2s_write(PORT_AMP, buf, min(N, total - done) * sizeof(int16_t), &wrote, portMAX_DELAY);
    return;
  }
  float w[V_HARM], wsum = 0;
  for (int k = 0; k < V_HARM; k++) { w[k] = vHarm[k] / (1.0f + n.soft * k * k * 0.3f); wsum += w[k]; }
  float a = n.aMs ? n.aMs / 1000.0f : (0.03f - 0.025f * V_ATTACK) * dur;
  float b = n.bMs ? n.bMs / 1000.0f : 0.5f * dur;
  float flD = V_FLUTTER * n.flutter, flHz = n.flHz > 0 ? n.flHz : V_FL_HZ, br = V_BREATH * n.breath;
  float amp = 26000.0f * VOLUME * n.vol * 1.3f / wsum;
  float mid = n.hzMid > 0 ? n.hzMid : 0, end = n.hzEnd > 0 ? n.hzEnd : (mid > 0 ? mid : n.hz);
  float ratio2 = n.hz2 > 0 ? n.hz2 / n.hz : 0;
  float vibPh = (aRand() + 1) * PI;
  static float ph = 0, ph2 = 0, jit = 0, nb = 0;
  for (int done = 0; done < total;) {
    int k = min(N, total - done);
    float f = n.hz;
    for (int i = 0; i < k; i++, done++) {
      float t = done / (float)SR, x = t / dur;
      // pitch contour
      if (mid > 0) f = x < n.midAt ? n.hz + (mid - n.hz) * x / n.midAt
                                   : mid + (end - mid) * (x - n.midAt) / (1.0f - n.midAt);
      else f = n.hz + (end - n.hz) * x;
      jit = jit * 0.95f + 0.05f * aRand();
      float semis = V_VIB_ST * sinf(TWO_PI * V_VIB_HZ * t + vibPh) + V_JIT_ST * jit * 5.0f;
      if (n.warble > 0) semis += n.warble * sinf(TWO_PI * 11.0f * t);
      f *= exp2f(semis / 12.0f);
      ph += TWO_PI * f / SR; if (ph > TWO_PI) ph -= TWO_PI;
      float v = harmSum(ph, f, w);
      if (ratio2 > 0) {
        ph2 += TWO_PI * f * ratio2 / SR; if (ph2 > TWO_PI) ph2 -= TWO_PI;
        v = v * 0.62f + 0.48f * harmSum(ph2, f * ratio2, w);
      }
      if (flD > 0.01f) v *= 1.0f - flD * (0.5f + 0.5f * sinf(TWO_PI * flHz * t));
      if (br > 0) { nb = 0.97f * nb + aRand(); v += br * nb * 0.2f * wsum; }
      float e;
      if (n.env == 1) e = (t < a ? t / a : 1.0f) * expf(-fmaxf(t - a, 0) / b);
      else e = t < a ? t / a : (t > dur - b ? fmaxf((dur - t) / b, 0) : 1.0f);
      buf[i] = (int16_t)clampf(v * e * amp, -32000, 32000);
    }
    playingHz = f;
    i2s_write(PORT_AMP, buf, k * sizeof(int16_t), &wrote, portMAX_DELAY);
  }
}

void audioTask(void *) {
  int32_t mic[256];
  int16_t zero[256] = {0};
  size_t got, wrote;
  for (;;) {
    if (playReq) {
      playReq = false;
      playing = true;
      int n = playLen;
      for (int i = 0; i < n && !playReq; i++) renderNote(playList[i]);
      for (int b = 0; b < 9; b++) i2s_write(PORT_AMP, zero, sizeof(zero), &wrote, portMAX_DELAY);  // flush all 8 DMA buffers
      i2s_zero_dma_buffer(PORT_AMP);
      playingHz = 0;
      playing = false;
      i2s_zero_dma_buffer(PORT_MIC);        // drop what the mic heard of our own song
      continue;
    }
    // mic: always drained so DMA never overflows
    i2s_read(PORT_MIC, mic, sizeof(mic), &got, 20 / portTICK_PERIOD_MS);
    int n = got / sizeof(int32_t);
    int peak = 0;
    for (int i = 0; i < n; i++) {
      int v = mic[i] >> 14;
      int a = abs(v);
      if (a > peak) peak = a;
      if (recording && recBuf && recLen < recCap) {
        int s = v * 2;                        // a little gain for whisper
        recBuf[recLen++] = (int16_t)(s > 32767 ? 32767 : (s < -32768 ? -32768 : s));
      }
    }
    micLevel = (micLevel * 3 + peak) / 4;
  }
}

/** Queue a melody (replaces whatever is playing). */
void playNotes(const Note *notes, int n) {
  n = min(n, MAX_NOTES);
  for (int i = 0; i < n; i++) playList[i] = notes[i];
  playLen = n;
  playReq = true;
}

// ---------- melodies ----------
uint32_t rngState = 1;
uint32_t rnd() { rngState ^= rngState << 13; rngState ^= rngState >> 17; rngState ^= rngState << 5; return rngState; }
float semis(float root, int s) { return root * powf(2.0f, s / 12.0f); }

/**
 * The reply melody: one family, one reading → one tune. Deterministic from
 * (family, intensity, agitation, glow, hue) so the same sentence sings the
 * same way, as the same sentence grows the same spore.
 */
int familyMelody(int fam, float inten, float agit, float glow, int hue, Note *out) {
  static const int SC_PENT[] = {0, 2, 4, 7, 9, 12, 14, 16};
  static const int SC_LYD[]  = {0, 2, 4, 6, 7, 9, 11, 12};
  static const int SC_WHOLE[] = {0, 2, 4, 6, 8, 10, 12, 14};
  static const int SC_MAJ[]  = {0, 4, 7, 12, 16, 19, 24, 28};
  static const int SC_MIN[]  = {0, 3, 5, 7, 10, 12, 15, 17};
  const int *sc; float root; int baseMs; bool harmony = false, echo = false;
  static const float SOFT[] = {0.8f, 1.5f, 0.0f, 1.0f, 0.0f, 1.2f};     // voice colour per family
  static const float FLUT[] = {0.3f, 0.1f, 1.0f, 1.0f, 0.6f, 1.0f};
  static const float BRTH[] = {1.0f, 1.0f, 1.0f, 1.8f, 1.0f, 1.5f};
  switch (fam) {
    case 0: sc = SC_PENT;  root = 523.25f; baseMs = 300; break;              // tender: warm, unhurried
    case 1: sc = SC_PENT;  root = 392.00f; baseMs = 460; break;              // calm: low, long
    case 2: sc = SC_LYD;   root = 587.33f; baseMs = 170; break;              // curious: bright, hopping
    case 3: sc = SC_WHOLE; root = 659.25f; baseMs = 260; echo = true; break; // dreamy: floating, echoes
    case 4: sc = SC_MAJ;   root = 349.23f; baseMs = 280; harmony = true; break; // companion: in thirds
    default: sc = SC_MIN;  root = 440.00f; baseMs = 420; break;              // lonely: minor, sinking
  }
  if (glow > 0.6f) root *= 1.12246f;                   // a whole tone brighter
  rngState = 0x9E3779B9u ^ (fam * 7919u) ^ ((uint32_t)(inten * 100) << 8)
           ^ ((uint32_t)(agit * 100) << 16) ^ (uint32_t)hue;
  int notes = 4 + (int)lroundf(clampf(inten, 0, 1) * 6);
  float msScale = 1.25f - clampf(agit, 0, 1) * 0.6f;
  int deg = fam == 5 ? 6 : 3, k = 0;
  for (int i = 0; i < notes && k < MAX_NOTES - 2; i++) {
    static const int STEPS[] = {-2, -1, 1, 2, -1, 1};   // never stand still
    int step = STEPS[rnd() % 6];
    if ((fam == 0 || fam == 1) && abs(step) == 2 && rnd() % 2) step /= 2;  // tender/calm: gentler
    if (fam == 2 && rnd() % 3 == 0) step *= 2;          // curious leaps
    if (fam == 5 && rnd() % 3) step = -abs(step);       // lonely drifts down
    if (deg + step < 0 || deg + step > 7) step = -step; // bounce off the edges
    deg = constrain(deg + step, 0, 7);
    if (i == notes - 1 && fam != 3 && fam != 5) deg = (deg >= 4) ? 5 : 0;  // settle home
    float hz = semis(root, sc[deg]);
    uint16_t ms = (uint16_t)(baseMs * msScale * (i == notes - 1 ? 1.8f : (rnd() % 4 == 0 ? 1.5f : 1.0f)));
    Note nt = {hz * 0.98f, harmony ? semis(hz, -(rnd() % 2 ? 3 : 4)) : 0.0f, ms, 0.9f};
    nt.hzMid = hz; nt.midAt = 0.2f; nt.hzEnd = i == notes - 1 ? hz * 0.97f : hz;   // slide into each note
    nt.soft = SOFT[fam]; nt.flutter = FLUT[fam]; nt.breath = BRTH[fam];
    out[k++] = nt;
    if (echo && rnd() % 2) { Note e = {hz * 2, 0, (uint16_t)(ms / 2), 0.28f}; e.soft = 2.0f; e.flutter = 0.2f; out[k++] = e; }
    if (fam == 2) out[k++] = {0, 0, (uint16_t)(ms / 3), 0};   // staccato gaps
  }
  return k;
}

// Event sounds, ported from scripts/moony-voice/voice.py (pitches are multiples of the voice's centre).
Note vc(uint16_t ms, float m0, float m2, float m1 = 0, float midAt = 0.5f, uint8_t env = 0,
        uint16_t aMs = 0, uint16_t bMs = 0, float soft = 0, float flutter = 1, float breath = 1) {
  Note n = {m0 * V_PITCH, 0, ms, 0.9f};
  n.hzEnd = m2 * V_PITCH; n.hzMid = m1 * V_PITCH; n.midAt = midAt; n.env = env;
  n.aMs = aMs; n.bMs = bMs; n.soft = soft; n.flutter = flutter; n.breath = breath;
  return n;
}
Note rest(uint16_t ms) { return {0, 0, ms, 0}; }
#define PLAY(...) do { Note _n[] = {__VA_ARGS__}; playNotes(_n, sizeof(_n) / sizeof(_n[0])); } while (0)

void tuneHello()   { PLAY(vc(140, 0.9f, 1.2f, 0, .5f, 1, 0, 100), rest(50), vc(300, 1.1f, 1.4f, 1.55f, .4f)); }
void tunePat()     { PLAY(vc(380, 0.85f, 0.72f, 0.95f, .35f, 0, 40, 220, 1.0f, 0.25f, 1.6f)); }
void tuneListen()  { PLAY(vc(360, 0.72f, 1.0f, 0, .5f, 0, 50, 120, 2.5f, 0.0f)); }
void tuneThink()   { PLAY(vc(110, 0.9f, 0.93f, 0, .5f, 0, 20, 50, 2.0f, 0.2f), rest(90),
                          vc(110, 1.05f, 1.08f, 0, .5f, 0, 20, 50, 2.0f, 0.2f), rest(90),
                          vc(110, 0.95f, 0.98f, 0, .5f, 0, 20, 50, 2.0f, 0.2f)); }
void tuneHm()      { PLAY(vc(220, 0.9f, 1.15f, 0, .5f, 0, 30, 80, 1.5f, 0.1f)); }
void tuneLook()    { PLAY(vc(150, 1.0f, 1.5f, 0, .5f, 1, 0, 120), rest(120), vc(180, 1.15f, 1.85f, 0, .5f, 1, 0, 140)); }
void tuneHappy()   { PLAY(vc(90, 1.0f, 1.04f, 0, .5f, 1, 0, 70), rest(30), vc(90, 1.26f, 1.31f, 0, .5f, 1, 0, 70), rest(30),
                          vc(90, 1.12f, 1.16f, 0, .5f, 1, 0, 70), rest(30), vc(90, 1.5f, 1.56f, 0, .5f, 1, 0, 70)); }
void tuneSad()     { PLAY(vc(950, 1.05f, 0.6f, 1.1f, .25f, 0, 80, 400, 0, 0.4f, 1.4f)); }
void tuneStartle() { const float s = 1 + 0.3f * V_SPREAD;
                     PLAY(vc(260, 1.3f * s, 1.0f * s, 1.6f * s, .06f, 1, 3, 110, 0, 0.6f)); }
void tuneGrumpy()  { Note n = vc(500, 0.66f, 0.58f, 0.62f, .5f, 0, 20, 150, 0, 0.9f / V_FLUTTER); n.flHz = 24; PLAY(n); }
void tuneDizzy()   { Note n = vc(900, 1.2f, 1.1f, 0.9f, .5f, 0, 50, 300, 0, 0.3f); n.warble = 1.6f; PLAY(n); }
void tuneSleep()   { PLAY(vc(1300, 0.95f, 0.55f, 1.35f, .25f, 0, 120, 600, 1.2f, 0.15f, 2.5f)); }
void tuneWake()    { PLAY(vc(550, 0.65f, 1.35f, 1.45f, .7f, 0, 60, 150, 0, 1, 1.5f)); }
void tuneReunion() { PLAY(vc(130, 1.0f, 1.05f, 0, .5f, 1, 0, 100), rest(60), vc(130, 1.26f, 1.3f, 0, .5f, 1, 0, 100), rest(60),
                          vc(340, 1.5f, 1.5f, 1.62f, .5f)); }
void tuneOffline() { PLAY(vc(220, 0.9f, 1.0f, 0, .5f, 0, 30, 80, 1.5f, 0.1f), rest(60),
                          vc(350, 0.95f, 0.7f, 0, .5f, 0, 30, 200, 1.2f)); }
void tuneShy()     { PLAY(vc(160, 0.95f, 1.15f, 0, .5f, 0, 20, 90, 1.2f, 0.2f, 1.3f), rest(40),
                          vc(260, 1.05f, 0.9f, 1.2f, .3f, 0, 30, 160, 1.4f, 0.15f, 1.6f)); }       // a bashful little "oo"
void tunePurr()    { Note n = vc(1100, 0.78f, 0.74f, 0.82f, .5f, 0, 120, 500, 1.6f, 0.6f / 0.213f, 1.8f);
                     n.flHz = 22; PLAY(n); }                                                        // long low buzzy coo
void tuneBoop()    { PLAY(vc(70, 1.4f, 1.8f, 0, .5f, 1, 2, 50), rest(30), vc(180, 1.3f, 1.6f, 1.9f, .3f, 1, 0, 120)); } // boop! hee
void tuneChirp()   { PLAY(vc(90, 1.2f, 1.5f, 0, .5f, 1, 0, 70)); }                                  // tiny chirp

void tuneDance() {
  Note n[24]; int k = 0;
  const float m[] = {1.0f, 1.26f, 1.12f, 1.5f};
  for (int r = 0; r < 3; r++)
    for (int i = 0; i < 4; i++) { n[k++] = vc(110, m[i], m[i] * 1.04f, 0, .5f, 1, 0, 80); n[k++] = rest(r == 2 && i == 3 ? 0 : 60); }
  playNotes(n, k);
}

// =====================================================================
//  NETWORK — Wi-Fi + one HTTP round trip to moony-listen on the Pi.
// =====================================================================
enum Reply { R_NONE, R_PENDING, R_COMMAND, R_READING, R_EMPTY, R_OFFLINE };
volatile Reply reply = R_NONE;
char replyCmd[12] = "";
int rFam = 1; float rInt = 0.5f, rAgit = 0.3f, rGlow = 0.3f; int rHue = 200;
volatile bool sendReq = false;
IPAddress piAddr;
bool piKnown = false;
bool mdnsUp = false;

float jsonNum(const String &s, const char *key, float dflt) {
  int i = s.indexOf(String("\"") + key + "\":");
  if (i < 0) return dflt;
  return s.substring(i + strlen(key) + 3).toFloat();
}
String jsonStr(const String &s, const char *key) {
  int i = s.indexOf(String("\"") + key + "\":\"");
  if (i < 0) return "";
  int a = i + strlen(key) + 4, b = s.indexOf('"', a);
  return b > a ? s.substring(a, b) : "";
}

bool resolvePi() {
  if (WiFi.status() != WL_CONNECTED) return false;
  if (!mdnsUp) mdnsUp = MDNS.begin("moony");
  if (mdnsUp) {
    IPAddress a = MDNS.queryHost(PI_HOSTNAME, 1500);
    if (a.toString() != "0.0.0.0") { piAddr = a; piKnown = true; return true; }
  }
  piKnown = piAddr.fromString(PI_IP);
  return piKnown;
}

void netTask(void *) {
  for (;;) {
    if (!sendReq) { vTaskDelay(20 / portTICK_PERIOD_MS); continue; }
    sendReq = false;
    Reply r = R_OFFLINE;
    if (WiFi.status() == WL_CONNECTED && (piKnown || resolvePi())) {
      HTTPClient http;
      String url = String("http://") + piAddr.toString() + ":" + PI_PORT + "/hear";
      http.begin(url);
      http.setTimeout(25000);
      http.addHeader("Content-Type", "application/octet-stream");
      http.addHeader("X-Rate", String(SR));
      int code = http.POST((uint8_t *)recBuf, recLen * sizeof(int16_t));
      if (code == 200) {
        String body = http.getString();
        String kind = jsonStr(body, "kind");
        if (kind == "command") {
          jsonStr(body, "cmd").toCharArray(replyCmd, sizeof(replyCmd));
          r = R_COMMAND;
        } else if (kind == "reading") {
          rFam = (int)jsonNum(body, "family", 1);
          rInt = jsonNum(body, "intensity", 0.5f);
          rAgit = jsonNum(body, "agitation", 0.3f);
          rGlow = jsonNum(body, "glow", 0.3f);
          rHue = (int)jsonNum(body, "hue", 200);
          r = R_READING;
        } else if (kind == "none") r = R_EMPTY;
      } else {
        Serial.printf("[net] Pi %s → %d\n", url.c_str(), code);
        piKnown = false;                      // re-resolve next time
      }
      http.end();
    }
    reply = r;
  }
}

// =====================================================================
//  BODY — eyes, presence, touch, tilt (from m0-eyes)
// =====================================================================
enum Mood { NEUTRAL, HAPPY, SLEEPY, SAD, ANGRY, DIZZY };
Mood mood = NEUTRAL;

float px = 0, py = 0, tx = 0, ty = 0;
uint32_t nextSaccade = 0;
uint32_t nextBlink = 2500, blinkStart = 0;
bool doubleBlink = false;

constexpr int NEAR_MM = 500, CLOSE_MM = 200;
constexpr uint32_t HOLD_MS = 700, LONELY_MS = 20000;
constexpr uint32_t REUNION_AFTER_MS = 60000;      // alone this long → chime when someone comes back
constexpr int CLAP_LEVEL = 24000;
int rangeMM = 9999, bgMM = 9999, nearGate = NEAR_MM;
bool peekCovered = false;            // something right over the ToF window (peekaboo)
uint32_t coverStart = 0;
uint32_t lastRangePoll = 0, lastPresence = 0, noticedAt = 0, leftAt = 0, lastReunion = 0;
bool wasNear = false, moodFromPresence = false, debugRange = false;
uint32_t lastDbg = 0;

// MPU6050
constexpr uint8_t MPU_ADDR = 0x68;
bool hasMpu = false;
float tiltX = 0, tiltZ = 1, shake = 0;
uint32_t shookAt = 0;
void mpuWrite(uint8_t reg, uint8_t val) { Wire.beginTransmission(MPU_ADDR); Wire.write(reg); Wire.write(val); Wire.endTransmission(); }
bool mpuBegin() {
  Wire.beginTransmission(MPU_ADDR);
  if (Wire.endTransmission() != 0) return false;
  mpuWrite(0x6B, 0x00); mpuWrite(0x1C, 0x00); mpuWrite(0x1A, 0x03);
  return true;
}
void mpuUpdate() {
  Wire.beginTransmission(MPU_ADDR); Wire.write(0x3B);
  if (Wire.endTransmission(false) != 0) return;
  if (Wire.requestFrom((int)MPU_ADDR, 6) != 6) return;
  int16_t ax = (Wire.read() << 8) | Wire.read();
  int16_t ay = (Wire.read() << 8) | Wire.read();
  int16_t az = (Wire.read() << 8) | Wire.read();
  float gx = ax / 16384.0f, gy = ay / 16384.0f, gz = az / 16384.0f;
  static float pm = 1.0f;
  float mag = sqrtf(gx * gx + gy * gy + gz * gz);
  shake = shake * 0.85f + fabsf(mag - pm) * 1.5f;
  pm = mag;
  tiltX = tiltX * 0.85f + clampf(gy, -1, 1) * 0.15f;
  tiltZ = tiltZ * 0.85f + gz * 0.15f;
}

// MPR121
// Touch sensitivity: the signal (shown per pad by the 't' monitor) must rise this much to count
// as a touch. Triggers on its own → raise it; no response through the lid → lower it (min 3).
#ifndef TOUCH_TH
#define TOUCH_TH 6
#endif
constexpr uint8_t MPR_ADDR = 0x5A;
bool hasMpr = false;
uint16_t touched = 0;
uint32_t touchStart = 0;
void mprWrite(uint8_t reg, uint8_t val) { Wire.beginTransmission(MPR_ADDR); Wire.write(reg); Wire.write(val); Wire.endTransmission(); }
bool mprBegin() {
  Wire.beginTransmission(MPR_ADDR);
  if (Wire.endTransmission() != 0) return false;
  mprWrite(0x80, 0x63); delay(10);
  mprWrite(0x5E, 0x00);
  // electrodes sit behind 1.2 mm of PLA at the end of 15–30 cm leads: a finger moves the
  // signal only ~5–15 counts, so trigger at TOUCH_TH and let auto-config tune each pad
  for (uint8_t i = 0; i < 12; i++) { mprWrite(0x41 + i * 2, TOUCH_TH); mprWrite(0x42 + i * 2, TOUCH_TH / 2); }
  mprWrite(0x2B, 0x01); mprWrite(0x2C, 0x01); mprWrite(0x2D, 0x0E); mprWrite(0x2E, 0x00);
  // falling (finger approaching) baseline filter: slow. With the usual NHD 5 / NCL 1 the
  // baseline chases a weak touch through the lid within a few ms and it never registers.
  mprWrite(0x2F, 0x01); mprWrite(0x30, 0x01); mprWrite(0x31, 0x10); mprWrite(0x32, 0x04);
  // fixed charge 16 µA / 0.5 µs, 2-sample debounce. No auto-config: on the long leads it fails
  // (ACFF, every pad OOR) and a pad marked OOR never reports a touch (bench, E3, 2026-10-26).
  mprWrite(0x5B, 0x22); mprWrite(0x5C, 0x10); mprWrite(0x5D, 0x20);
  mprWrite(0x5E, 0xCF);              // 12 pads, baseline loaded from the full 10-bit reading
  return true;
}
/** Re-take every baseline from the current reading (nobody should be touching). */
void mprRestart() { mprWrite(0x5E, 0x00); mprWrite(0x5E, 0xCF); }
uint16_t mprRead() {
  Wire.beginTransmission(MPR_ADDR); Wire.write(0x00);
  if (Wire.endTransmission(false) != 0) return 0;
  if (Wire.requestFrom((int)MPR_ADDR, 2) != 2) return 0;
  uint16_t lo = Wire.read(), hi = Wire.read();
  return (lo | (hi << 8)) & 0x0FFF;
}
// touch monitor ('t'): per-electrode signal = baseline − filtered (a finger raises it)
bool touchMon = false;
int touchFocus = -1;                 // 'e' picks one pad to watch (-1 = all 12)
void mprPrintLevels(uint16_t t) {
  uint8_t raw[24], base[12];
  Wire.beginTransmission(MPR_ADDR); Wire.write(0x04);
  if (Wire.endTransmission(false) != 0 || Wire.requestFrom((int)MPR_ADDR, 24) != 24) return;
  for (int i = 0; i < 24; i++) raw[i] = Wire.read();
  Wire.beginTransmission(MPR_ADDR); Wire.write(0x1E);
  if (Wire.endTransmission(false) != 0 || Wire.requestFrom((int)MPR_ADDR, 12) != 12) return;
  for (int i = 0; i < 12; i++) base[i] = Wire.read();
  if (touchFocus >= 0) {             // one pad, with a bar so a weak touch is easy to see
    int i = touchFocus, filt = raw[i * 2] | ((raw[i * 2 + 1] & 0x03) << 8), d = (base[i] << 2) - filt;
    char bar[41]; int n = constrain(d, 0, 40);
    for (int k = 0; k < 40; k++) bar[k] = k < n ? '#' : (k == TOUCH_TH - 1 ? '|' : '.');
    bar[40] = 0;
    Serial.printf("E%d 信号 %3d %s %s  (基线 %d 读数 %d)\n", i, d, bar, (t >> i) & 1 ? "摸到" : "    ", base[i] << 2, filt);
    return;
  }
  for (int i = 0; i < 12; i++) {
    int filt = raw[i * 2] | ((raw[i * 2 + 1] & 0x03) << 8);
    Serial.printf("E%d:%3d%c ", i, (base[i] << 2) - filt, (t >> i) & 1 ? '*' : ' ');
  }
  Serial.println();
}


float blinkAmt(uint32_t now) {
  if (blinkStart == 0 || now < blinkStart) return 1.0f;
  float t = (now - blinkStart) / 1000.0f, dur = 0.22f;
  if (t >= dur) {
    if (doubleBlink) { doubleBlink = false; blinkStart = now + 90; } else blinkStart = 0;
    return 1.0f;
  }
  float ph = t / dur;
  return ph < 0.45f ? 1.0f - ph / 0.45f : (ph - 0.45f) / 0.55f;
}

// Each eye shows through a window two mosaic cells wide and one tall (the frame's two open cells),
// so the screen is split at EYE_SPLIT_X into a left and a right cell. EYE_MOSAIC 0 = the old round eyes.
#ifndef EYE_MOSAIC
#define EYE_MOSAIC 1
#endif
#ifndef EYE_SPLIT_X
#define EYE_SPLIT_X 64          // screen column under the line between the two cells
#endif
#if EYE_MOSAIC
// Same eye as the spores on the website (fieldRender.ts): two white cells, and a black pupil exactly one
// cell big that slides between them with the gaze — fully in the left cell looking left, fully in the
// right cell looking right. Lids cut straight across (mosaic, no curves).
void drawEye(Adafruit_SSD1306 &d, int sign, float breath, float open_) {
  d.clearDisplay();
  const int CW = EYE_SPLIT_X;                                            // one cell, in screen pixels
  int h = int(64 * open_ * (0.97f + 0.03f * breath));
  if (h > 64) h = 64;
  int cy = 32;
  if (h < 6) {                                                           // closed: a short bar across both cells
    d.fillRect(0, cy - 2, 2 * CW, 4, SSD1306_WHITE); d.display(); return;
  }
  int top = cy - h / 2;
  d.fillRect(0, top, 2 * CW, h, SSD1306_WHITE);                          // the two white cells
  float gz = mood == DIZZY ? sinf(millis() / 120.0f) : clampf(px, -1, 1);
  int x = int((gz * 0.5f + 0.5f) * CW);
  d.fillRect(x, top, CW, h, SSD1306_BLACK);                              // pupil: one whole cell
  if (mood == HAPPY)  d.fillRect(0, cy + h / 6, 128, 64, SSD1306_BLACK);            // cheeks push up
  if (mood == SLEEPY) d.fillRect(0, 0, 128, top + int(h * 0.45f), SSD1306_BLACK);   // heavy lids
  if (mood == SAD || mood == ANGRY) {                                    // slanted lid, one step per cell
    bool outerHigh = (mood == SAD) == (sign > 0);
    for (int c = 0; c < 2; c++) {
      bool high = (c == 1) == outerHigh;
      d.fillRect(c * CW, 0, CW, top + (high ? h / 5 : h / 2), SSD1306_BLACK);
    }
  }
  d.display();
}
#else
void drawEye(Adafruit_SSD1306 &d, int sign, float breath, float open_) {
  d.clearDisplay();
  int w = int(96 * breath), h = int(52 * breath * open_);
  int cx = 64, cy = 32;
  if (h < 6) { d.fillRoundRect(cx - w / 2, cy - 2, w, 4, 2, SSD1306_WHITE); d.display(); return; }
  if (h > 62) h = 62;
  d.fillRoundRect(cx - w / 2, cy - h / 2, w, h, 10, SSD1306_WHITE);
  int pxp = cx + int(px * 24), pyp = cy + int(py * 12), pr = 11;
  d.fillRoundRect(pxp - pr, pyp - pr, pr * 2, pr * 2, 4, SSD1306_BLACK);
  if (mood == HAPPY) {
    d.fillRoundRect(cx - w / 2 - 2, cy + h / 8, w + 4, h, 8, SSD1306_BLACK);
  } else if (mood == SLEEPY) {
    d.fillRect(cx - w / 2 - 2, cy - h / 2 - 2, w + 4, int(h * 0.45f), SSD1306_BLACK);
  } else if (mood == SAD) {
    for (int i = 0; i < w; i++) d.drawFastVLine(cx - w / 2 + i, cy - h / 2, int((sign > 0 ? i : (w - i)) * 0.28f), SSD1306_BLACK);
  } else if (mood == ANGRY) {
    for (int i = 0; i < w; i++) d.drawFastVLine(cx - w / 2 + i, cy - h / 2, int((sign > 0 ? (w - i) : i) * 0.30f), SSD1306_BLACK);
  } else if (mood == DIZZY) {
    d.drawFastHLine(pxp - pr - 4, pyp, pr * 2 + 8, SSD1306_BLACK);
    d.drawFastVLine(pxp, pyp - pr - 4, pr * 2 + 8, SSD1306_BLACK);
  }
  d.display();
}

#endif

#if USE_TOF
void calibrate() {
  int v[24], n = 0;
  uint32_t t0 = millis();
  while (n < 24 && millis() - t0 < 1200) {
    if (lox.isRangeComplete()) { int r = lox.readRangeResult(); if (r > 0 && r < 8000) v[n++] = r; }
    delay(15);
  }
  if (n < 5) { bgMM = 9999; nearGate = NEAR_MM; }
  else {
    for (int i = 1; i < n; i++) for (int j = i; j > 0 && v[j] < v[j - 1]; j--) { int t = v[j]; v[j] = v[j - 1]; v[j - 1] = t; }
    bgMM = v[n / 2];
    nearGate = (bgMM < NEAR_MM + 120) ? max(80, bgMM - 120) : NEAR_MM;
  }
  // the VL53L0X looks out in a ~25° cone; if the W window's bore crops it, the bore wall answers at a
  // few cm all the time. Then nothing it reports is a person: switch presence + peekaboo off (eyes calm).
  tofBlind = n >= 5 && bgMM < 120;
  Serial.printf("背景 %d mm → 发现门限 %d mm%s\n", bgMM, nearGate,
                tofBlind ? "  ⚠ ToF 一直看到窗口内壁,先不用它(c 键可重测)" : "");
}
#endif

// =====================================================================
//  STATES — what Moony is doing besides just being alive
// =====================================================================
enum Act { A_IDLE, A_LISTEN, A_THINK, A_REPLY, A_SLEEP, A_LOOK, A_DANCE, A_HM, A_TOUCH };
Act act = A_IDLE;
uint32_t actUntil = 0, actStart = 0;
Mood replyMood = NEUTRAL;

Mood familyMood(int fam) {
  switch (fam) { case 0: case 4: return HAPPY; case 3: return SLEEPY; case 5: return SAD; default: return NEUTRAL; }
}

void startAct(Act a, uint32_t now, uint32_t ms) { act = a; actStart = now; actUntil = now + ms; }

// =====================================================================
//  TOUCH REACTIONS — each of the 12 pads (J7 E0–E11) is a place on Moony's body
// =====================================================================
enum Pad { P_TOP, P_CAP_L, P_CAP_R, P_CHEEK_L, P_CHEEK_R, P_FOREHEAD, P_SIDE_L, P_SIDE_R, P_BACK, P_BASE, P_NOSE, P_NAPE };
// Eyes look toward the touched side. If they look away from it instead, flip this to -1.
#ifndef TOUCH_GAZE_SIDE
#define TOUCH_GAZE_SIDE 1
#endif
Mood touchMood = HAPPY;
float touchTx = 0, touchTy = 0, touchOpen = 1.0f;
bool touchLookAround = false;
uint32_t padDown[12] = {0}, padUp[12] = {0}, padMutedUntil[12] = {0}, padFlipAt[12] = {0};
uint8_t padFlips[12] = {0};
bool padHoldFired[12] = {false};

/** A pad that keeps flickering on/off by itself (a lead sitting right at the threshold) is muted
 *  for a minute instead of chirping every half second. Returns the pads that may react. */
uint16_t steadyPads(uint16_t cur, uint16_t prev, uint32_t now) {
  uint16_t ok = 0;
  for (int i = 0; i < 12; i++) {
    bool on = (cur >> i) & 1, was = (prev >> i) & 1;
    if (on != was) {
      if (now - padFlipAt[i] > 4000) padFlips[i] = 0;
      if (padFlips[i]++ == 0) padFlipAt[i] = now;
      if (padFlips[i] > 10) {                                    // >5 presses in 4 s, nobody pokes like that
        padMutedUntil[i] = now + 60000; padFlips[i] = 0;
        Serial.printf("E%d 一直自己跳(线或铜箔信号不稳),先静音 60 秒\n", i);
      }
    }
    if (now >= padMutedUntil[i]) ok |= 1u << i;
  }
  return ok;
}

void touchReact(const char *what, uint32_t now, uint32_t ms, Mood m, float gx, float gy, float open_ = 1.0f,
                bool around = false) {
  touchMood = m; touchTx = gx; touchTy = gy; touchOpen = open_; touchLookAround = around;
  startAct(A_TOUCH, now, ms);
  Serial.printf("互动: %s\n", what);
}

/** Per-pad gestures: a press, a short tap (released < 600 ms), a hold, tickles and hugs. */
void handleTouch(uint16_t cur, uint16_t prev, uint32_t now) {
  uint16_t ok = steadyPads(cur, prev, now);
  cur &= ok; prev &= ok;
  const float L = -0.8f * TOUCH_GAZE_SIDE, R = 0.8f * TOUCH_GAZE_SIDE;     // robot's own left / right
  static uint32_t lastReact = 0, tickleAt = 0, capLAt = 0, capRAt = 0;
  static int tickles = 0;
  bool free_ = act == A_IDLE || act == A_TOUCH;
  int held = 0;
  for (int i = 0; i < 12; i++) held += (cur >> i) & 1;
  // a hug: three or more places at once
  if (held >= 3 && free_ && now - lastReact > 1500) {
    lastReact = now; tuneReunion();
    touchReact("抱住(好几处一起)", now, 2500, HAPPY, 0, 0.1f, 0.8f); return;
  }
  for (int i = 0; i < 12; i++) {
    bool on = (cur >> i) & 1, was = (prev >> i) & 1;
    if (!on && was) padUp[i] = now;
    if (on && !was) {
      if (now - padUp[i] < 250 && padUp[i]) { continue; }             // chatter, not a new press
      padDown[i] = now; padHoldFired[i] = false;
    }
    uint32_t dur = now - padDown[i];
    if (!free_ || now - lastReact < 450) continue;
    // ---- on press
    if (on && !was) {
      switch (i) {
        case P_CAP_L: case P_CAP_R: {
          uint32_t &mine = i == P_CAP_L ? capLAt : capRAt, other = i == P_CAP_L ? capRAt : capLAt;
          mine = now;
          if (other && now - other < 1500) {                     // stroked across the cap
            capLAt = capRAt = 0; lastReact = now; tunePurr();
            touchReact("顺着伞盖摸(呼噜)", now, 2600, HAPPY, 0, -0.2f, 0.55f);
          } else {
            lastReact = now; tuneChirp();
            touchReact(i == P_CAP_L ? "摸伞盖左边" : "摸伞盖右边", now, 1400, NEUTRAL, i == P_CAP_L ? L : R, -0.5f, 1.1f);
          }
          break;
        }
        case P_CHEEK_L: case P_CHEEK_R:                           // shy: looks down and away
          lastReact = now; tuneShy();
          touchReact(i == P_CHEEK_L ? "摸左脸" : "摸右脸", now, 1800, HAPPY, i == P_CHEEK_L ? R * 0.7f : L * 0.7f, 0.55f, 0.7f);
          break;
        case P_NOSE:
          lastReact = now; tuneBoop();
          touchReact("点鼻尖", now, 1200, HAPPY, 0, 0.45f, 1.25f);
          break;
        case P_SIDE_L: case P_SIDE_R:                             // tickle: three pokes in 2.5 s → giggles
          tickles = (now - tickleAt < 2500) ? tickles + 1 : 1; tickleAt = now; lastReact = now;
          if (tickles >= 3) { tickles = 0; tuneDance(); startAct(A_DANCE, now, 3000); Serial.println("互动: 挠痒痒(咯咯笑)"); }
          else { tuneChirp(); touchReact(i == P_SIDE_L ? "戳左边" : "戳右边", now, 900, HAPPY, i == P_SIDE_L ? L : R, 0.2f, 1.1f); }
          break;
        case P_BASE:
          lastReact = now; tuneHm();
          touchReact("碰底座", now, 1400, NEUTRAL, 0, 0.75f);
          break;
        case P_NAPE:                                              // behind its head: who's there?
          lastReact = now; tuneStartle();
          touchReact("摸后脑勺(谁在后面?)", now, 1800, NEUTRAL, 0, -0.6f, 1.2f, true);
          break;
      }
    }
    // ---- holds
    if (on && !padHoldFired[i]) {
      if (i == P_FOREHEAD && dur > 2500) {                       // stroke the forehead and it drifts off
        padHoldFired[i] = true; lastReact = now; tuneSleep(); startAct(A_SLEEP, now, 30000);
        Serial.println("互动: 按住额头(睡着了)");
      } else if (i == P_BACK && dur > 1500) {                    // a hand on its back: calm
        padHoldFired[i] = true; lastReact = now;
        Note m[MAX_NOTES]; int n = familyMelody(1, 0.4f, 0.1f, 0.3f, 200, m); playNotes(m, n);
        touchReact("手放在背上(安心)", now, 4000, HAPPY, 0, 0.2f, 0.6f);
      }
    }
    // ---- short taps, on release
    if (!on && was && dur < 600 && !padHoldFired[i]) {
      if (i == P_TOP) {
        static uint32_t pats[5] = {0};
        for (int j = 4; j > 0; j--) pats[j] = pats[j - 1];
        pats[0] = now; lastReact = now;
        if (pats[4] && now - pats[4] < 15000) {                    // fifth pat in 15 s: melts
          memset(pats, 0, sizeof(pats)); tuneReunion();
          touchReact("被摸了好多下(好开心)", now, 3000, HAPPY, 0, -0.1f, 0.55f);
        } else { tunePat(); touchReact("拍拍头", now, 1200, HAPPY, 0, -0.2f, 0.75f); }
      }
      else if (i == P_FOREHEAD) { lastReact = now; tuneHm(); blinkStart = now; doubleBlink = true;
                                  touchReact("点额头", now, 1000, NEUTRAL, 0, -0.7f); }
      else if (i == P_BACK) { lastReact = now; tunePat(); touchReact("拍拍背", now, 1200, HAPPY, 0, 0.1f, 0.8f); }
    }
  }
}


// =====================================================================
//  INNER LIFE — when nobody is playing with it, Moony keeps itself company
// =====================================================================
// Three slow inner states drift with time and pick what it does next:
//   energy    falls while awake (~30 min to tired), refills while dozing
//   boredom   rises while alone, any touch / voice / clap resets it
//   curiosity wanders on its own
// Every 25–70 s of quiet it does one small thing — hums, babbles to itself, looks around,
// daydreams, sighs, sneezes, recalls the last thing someone told it, or dozes off — quietly.
float energy = 1.0f, boredom = 0.0f, curiosity = 0.5f;
int lastFam = -1;
uint32_t lastFamAt = 0, nextLife = 30000, lastLifeTick = 0;

float frand() { return (esp_random() & 0xFFFF) / 65535.0f; }

void playQuiet(Note *n, int k, float vol) {
  for (int i = 0; i < k; i++) n[i].vol *= vol;
  playNotes(n, k);
}

/** Spore-talk: a run of 3–7 murmured syllables, each a little rise or fall, like thinking aloud. */
void babble(float mood_) {
  Note n[16]; int k = 0, syl = 3 + int(frand() * 5);
  float base = 0.85f + 0.25f * mood_;
  for (int i = 0; i < syl && k < 14; i++) {
    float a = base * (0.85f + 0.3f * frand()), b = a * (frand() < 0.5f ? 0.85f : 1.2f);
    n[k++] = vc(70 + int(frand() * 130), a, b, 0, .5f, frand() < 0.5f ? 1 : 0, 0, 0, 1.2f, 0.4f, 1.3f);
    if (frand() < 0.35f) n[k++] = rest(60 + int(frand() * 160));
  }
  playQuiet(n, k, 0.55f);
}

void tuneSneeze() { PLAY(vc(120, 0.9f, 1.15f, 0, .5f, 0, 30, 60, 1.0f, 0.2f, 1.8f), rest(60),
                         vc(140, 1.0f, 1.35f, 0, .5f, 0, 30, 60, 1.0f, 0.2f, 2.0f), rest(140),
                         vc(150, 1.9f, 0.9f, 0, .5f, 1, 2, 60, 0, 1.6f, 2.6f)); }      // a-a-chu!

void innerLife(uint32_t now, bool someoneNear, bool interacted) {
  float dt = (now - lastLifeTick) / 1000.0f; lastLifeTick = now;
  if (dt > 1) dt = 1;
  if (act == A_SLEEP) energy = fminf(1, energy + dt / 180.0f);
  else energy = fmaxf(0, energy - dt / 1800.0f);
  if (interacted) { boredom = 0; energy = fminf(1, energy + 0.02f); }
  else if (!someoneNear) boredom = fminf(1, boredom + dt / 300.0f);
  curiosity = clampf(curiosity + (frand() - 0.5f) * 0.02f, 0, 1);
  if (act != A_IDLE || playing || now < nextLife) return;
  nextLife = now + 25000 + uint32_t(frand() * 45000) + (someoneNear ? 20000 : 0);   // quieter with company

  // tired and alone: yawn and nap (wakes on its own after a few minutes, or when touched)
  if (energy < 0.25f && !someoneNear) {
    tuneSleep(); startAct(A_SLEEP, now, 120000 + uint32_t(frand() * 120000));
    Serial.println("自己: 困了,睡一会儿"); return;
  }
  // otherwise pick by weight
  float w[7] = {
    0.8f + 0.6f * (1 - boredom),                 // 0 hum a little tune to itself
    0.6f + 0.8f * curiosity,                     // 1 babble / talk to itself
    0.5f + 1.0f * curiosity,                     // 2 look around
    0.4f + 0.6f * (1 - energy),                  // 3 daydream
    0.2f + 1.2f * boredom,                       // 4 sigh (lonely)
    0.15f,                                       // 5 sneeze
    (lastFam >= 0 && now - lastFamAt < 600000) ? 1.2f : 0,   // 6 remember what someone said
  };
  float tot = 0; for (float v : w) tot += v;
  float r = frand() * tot; int pick = 0;
  while (pick < 6 && r > w[pick]) r -= w[pick++];
  Note m[MAX_NOTES]; int n;
  switch (pick) {
    case 0: n = familyMelody(int(frand() * 2) ? 0 : 1, 0.25f, 0.1f, 0.3f, int(frand() * 360), m); playQuiet(m, min(n, 6), 0.45f);
            touchReact("自己: 哼小调", now, 2600, HAPPY, 0, -0.3f, 0.7f); break;
    case 1: babble(1 - boredom); touchReact("自己: 自言自语", now, 2600, NEUTRAL, (frand() - 0.5f) * 0.8f, 0.3f, 0.95f); break;
    case 2: tuneChirp(); touchReact("自己: 东张西望", now, 2400, NEUTRAL, 0, -0.2f, 1.1f, true); break;
    case 3: n = familyMelody(3, 0.3f, 0.05f, 0.6f, int(frand() * 360), m); playQuiet(m, min(n, 5), 0.35f);
            touchReact("自己: 发呆做白日梦", now, 4000, SLEEPY, -0.6f, -0.7f, 0.8f); break;
    case 4: { Note s1 = vc(700, 0.95f, 0.65f, 1.0f, .2f, 0, 60, 380, 1.2f, 0.3f, 2.0f); playQuiet(&s1, 1, 0.5f); }
            touchReact("自己: 叹气(好无聊)", now, 2400, SAD, 0, 0.5f, 0.75f); break;
    case 5: tuneSneeze(); touchReact("自己: 打喷嚏", now, 1400, NEUTRAL, 0, 0.2f, 0.15f); break;
    case 6: n = familyMelody(lastFam, 0.4f, 0.2f, 0.4f, 200, m); playQuiet(m, min(n, 6), 0.4f);
            touchReact("自己: 想起刚才有人说的话", now, 3000, familyMood(lastFam), 0.5f, -0.5f, 0.85f); break;
  }
}


void handleReply(uint32_t now) {
  Reply r = reply;
  if (r == R_NONE || r == R_PENDING) return;
  reply = R_NONE;
  if (r == R_COMMAND) {
    Serial.printf("→ 口令 %s\n", replyCmd);
    if (!strcmp(replyCmd, "hello"))      { tuneHello(); replyMood = HAPPY; startAct(A_REPLY, now, 2500); }
    else if (!strcmp(replyCmd, "sleep")) { tuneSleep(); startAct(A_SLEEP, now, 30000); }
    else if (!strcmp(replyCmd, "wake"))  { tuneWake(); noticedAt = now; startAct(A_IDLE, now, 0); }
    else if (!strcmp(replyCmd, "look"))  { tuneLook(); startAct(A_LOOK, now, 8000); }
    else if (!strcmp(replyCmd, "dance")) { tuneDance(); startAct(A_DANCE, now, 3600); }
    else if (!strcmp(replyCmd, "sing")) {
      Note m[MAX_NOTES];
      int fam = esp_random() % 6;
      int n = familyMelody(fam, 0.8f, 0.4f, 0.5f, esp_random() % 360, m);
      playNotes(m, n); replyMood = familyMood(fam); startAct(A_REPLY, now, 4500);
    }
    else { tuneHm(); startAct(A_HM, now, 1500); }
  } else if (r == R_READING) {
    Serial.printf("→ 读到 family=%d intensity=%.2f\n", rFam, rInt);
    Note m[MAX_NOTES];
    int n = familyMelody(rFam, rInt, rAgit, rGlow, rHue, m);
    playNotes(m, n);
    replyMood = familyMood(rFam); lastFam = rFam; lastFamAt = now;
    uint32_t len = 0;
    for (int i = 0; i < n; i++) len += m[i].ms;
    startAct(A_REPLY, now, len + 1800);
  } else if (r == R_OFFLINE) {
    Serial.println("→ 连不上塔(热点/Pi?)");
    tuneOffline(); startAct(A_HM, now, 1800);
  } else {
    tuneHm(); startAct(A_HM, now, 1500);
  }
}

// =====================================================================
void setup() {
  Serial.begin(115200);
  Wire.begin(PIN_SDA, PIN_SCL);   Wire.setClock(400000);
  Wire1.begin(PIN_SDA2, PIN_SCL2); Wire1.setClock(400000);
  bool okL = eyeL.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  bool okR = eyeR.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  hasMpu = mpuBegin();
  hasMpr = mprBegin();
  Serial.printf("eyes L=%d R=%d  MPU=%d  MPR121=%d\n", okL, okR, hasMpu, hasMpr);
#if USE_TOF
  hasTof = lox.begin();
  Serial.printf("ToF=%d\n", hasTof);
  if (hasTof) { lox.startRangeContinuous(33); calibrate(); }
#endif

  recCap = (size_t)SR * LISTEN_MAX_MS / 1000;
  recBuf = (int16_t *)heap_caps_malloc(recCap * sizeof(int16_t), MALLOC_CAP_SPIRAM);
  if (!recBuf) {                       // PSRAM not enabled: fall back to 3 s in internal RAM
    recCap = SR * 3;
    recBuf = (int16_t *)malloc(recCap * sizeof(int16_t));
    Serial.println("PSRAM 没开(Tools → PSRAM: OPI PSRAM),录音缩到 3 秒");
  }
  voiceInit();
  setupAmp();
  setupMic();
  xTaskCreatePinnedToCore(audioTask, "audio", 8192, NULL, 3, NULL, 0);
  xTaskCreatePinnedToCore(netTask, "net", 8192, NULL, 1, NULL, 0);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.printf("Wi-Fi → %s(后台连接)\n", WIFI_SSID);
  randomSeed(esp_random());
  tuneWake();
}

void loop() {
  uint32_t now = millis();

  static bool wifiWas = false;
  bool wifiOk = WiFi.status() == WL_CONNECTED;
  if (wifiOk && !wifiWas) { Serial.printf("Wi-Fi 已连上 %s\n", WiFi.localIP().toString().c_str()); }
  wifiWas = wifiOk;

  // --- presence ---
#if USE_TOF
  if (hasTof && !tofBlind && now - lastRangePoll > 20) {
    lastRangePoll = now;
    if (lox.isRangeComplete()) { int r = lox.readRangeResult(); if (r > 0 && r < 8000) rangeMM = r; }
    // hysteresis: once someone is there, they stay "near" until clearly past the gate, so a reading
    // hovering on the gate doesn't flap startle/leave and pulse the eyes
    bool wasNearNow = (now - lastPresence) < HOLD_MS && lastPresence != 0;
    if (rangeMM > 0 && rangeMM < nearGate + (wasNearNow ? 100 : 0)) lastPresence = now;
  }
  if (debugRange && now - lastDbg > 250) { lastDbg = now; Serial.printf("距离 %4d mm  麦 %d\n", rangeMM, micLevel); }
#endif
  bool someoneNear = (now - lastPresence) < HOLD_MS && lastPresence != 0;
  bool someoneClose = someoneNear && rangeMM < CLOSE_MM;
  bool lonely = (now - lastPresence) > LONELY_MS;
  if (someoneNear && !wasNear) {
    noticedAt = now;
    bool wasAlone = leftAt == 0 || now - leftAt > REUNION_AFTER_MS;
    if (wasAlone && act == A_IDLE && !playing && now - lastReunion > REUNION_AFTER_MS) { tuneReunion(); lastReunion = now; }
  }
  if (!someoneNear && wasNear) leftAt = now;
  wasNear = someoneNear;
  bool startled = someoneNear && (now - noticedAt) < 450;
  bool justLeft = leftAt != 0 && (now - leftAt) < 1000;

  // --- tilt / touch ---
  static uint32_t lastImu = 0;
  if (hasMpu && now - lastImu > 25) { lastImu = now; mpuUpdate(); }
  bool upsideDown = hasMpu && tiltZ < -0.4f;
  if (hasMpu && shake > 1.2f) shookAt = now;
  bool jolted = (now - shookAt) < 700 && shookAt != 0;
  static bool wasJolted = false, wasUpside = false;      // say so once, on the way in
  if (jolted && !wasJolted && act != A_LISTEN) tuneGrumpy();
  if (upsideDown && !wasUpside && act != A_LISTEN) tuneDizzy();
  wasJolted = jolted; wasUpside = upsideDown;

  static uint32_t lastTouchPoll = 0;
  uint16_t prevTouch = touched;
  if (hasMpr && now - lastTouchPoll > 40) { lastTouchPoll = now; touched = mprRead(); }
  // the leads' reading sinks ~40–50 counts in the first seconds after power-up, which looks like a
  // touch and freezes the baseline: re-take baselines once it has settled, and whenever a pad has
  // been "held" far longer than anyone really holds Moony
  static bool settled = false;
  if (hasMpr && !settled) {
    touched = 0;                     // ignore touch until then
    if (now > 6000) { settled = true; mprRestart(); Serial.println("触摸基线已重新校准"); }
  }
  if (hasMpr && touched && prevTouch && now - touchStart > 10000 && act != A_LISTEN) {
    mprRestart(); touched = 0; touchStart = now; Serial.println("触摸卡住 10 秒,基线重新校准");
  }
  bool talkHeld = (touched & TALK_ELECTRODES) != 0;
  bool talkWas = (prevTouch & TALK_ELECTRODES) != 0;
  if (touched && !prevTouch) touchStart = now;
  static uint32_t lastMon = 0;
  if (touchMon && hasMpr && now - lastMon > 250) { lastMon = now; mprPrintLevels(touched); }
  if (touchMon && touched != prevTouch && touched) {
    Serial.print("摸到:");
    for (int i = 0; i < 12; i++) if ((touched >> i) & 1) Serial.printf(" E%d", i);
    Serial.println();
  }

  // --- hold the head to talk ---
  if (talkHeld && !talkWas && act != A_THINK) touchStart = now;
  if (talkHeld && act != A_LISTEN && act != A_THINK && now - touchStart > TALK_HOLD_MS) {
    recLen = 0; recording = true;
    startAct(A_LISTEN, now, LISTEN_MAX_MS);
    tuneListen();
    Serial.println("→ 在听…");
  }
  bool listenDone = act == A_LISTEN && (!talkHeld || now > actUntil || recLen >= recCap);
  if (listenDone) {
    recording = false;
    if (recLen > SR / 2) { reply = R_PENDING; sendReq = true; startAct(A_THINK, now, 30000); tuneThink(); }
    else startAct(A_IDLE, now, 0);
  }
  // touch reactions per place on the body (the head-top hold above is still "talk")
  if (act != A_LISTEN && act != A_THINK && act != A_SLEEP) handleTouch(touched & ~(talkHeld && now - touchStart > TALK_HOLD_MS ? TALK_ELECTRODES : 0), prevTouch, now);

  // clap → startle (only when quiet ourselves)
  // claps: one clap startles it; clap 2–4 times and it chirps back the same number
  static uint32_t clapAt = 0, clapPeakAt = 0;
  static int claps = 0;
  static bool clapHigh = false;
  bool loud = micLevel > CLAP_LEVEL;
  if (act == A_IDLE && !playing && loud && !clapHigh && now - clapPeakAt > 150) {
    if (!claps) noticedAt = now;                                  // eyes pop open at the first one
    claps++; clapPeakAt = now;
  }
  clapHigh = loud;
  if (claps && now - clapPeakAt > 900) {
    if (claps == 1) { clapAt = now; tuneStartle(); }
    else {
      Note sq[8]; int k = 0, n = min(claps, 4);
      for (int i = 0; i < n; i++) { sq[k++] = vc(90, 1.2f + 0.12f * i, 1.5f + 0.12f * i, 0, .5f, 1, 0, 70); sq[k++] = rest(170); }
      playNotes(sq, k);
      touchReact("拍手 → 跟着叫回去", now, 400 + 260 * n, HAPPY, 0, -0.35f, 1.15f);
    }
    claps = 0;
  }
  bool clapped = now - clapAt < 600 && clapAt != 0;
  static uint32_t lastTouchAny = 0;
  if (touched) lastTouchAny = now;
#if USE_TOF
  // peekaboo: cover its "eye" (the ToF window) for a moment, then take your hand away
  if (hasTof && !tofBlind) {
    // covered only after < 50 mm for 150 ms, uncovered only after > 90 mm for 100 ms: a reading that
    // hovers around the threshold (or the window itself reflecting) no longer snaps the eyes shut
    static uint32_t closeSince = 0, farSince = 0;
    if (rangeMM < 50) { if (!closeSince) closeSince = now; } else closeSince = 0;
    if (rangeMM > 90) { if (!farSince) farSince = now; } else farSince = 0;
    if (!peekCovered && closeSince && now - closeSince > 150) { peekCovered = true; coverStart = now; Serial.printf("ToF 被挡住 (%d mm) → 闭眼\n", rangeMM); }
    if (peekCovered && farSince && now - farSince > 100) {
      peekCovered = false;
      uint32_t held = now - coverStart;
      if (held > 700 && held < 8000 && (act == A_IDLE || act == A_TOUCH)) { tuneBoop(); touchReact("躲猫猫,找到你了!", now, 1600, HAPPY, 0, 0, 1.3f); }
    }
  }
#endif
  // someone has been standing there a while without touching it: it says hello first
  static uint32_t nearSince = 0, lastAsk = 0;
  if (!someoneNear) nearSince = 0; else if (!nearSince) nearSince = now;
  if (nearSince && now - nearSince > 25000 && now - lastTouchAny > 25000 && now - lastAsk > 60000 && act == A_IDLE && !playing) {
    lastAsk = now; tuneHello(); touchReact("一直看着我 → 先打招呼", now, 2200, HAPPY, 0, 0.1f, 1.1f);
  }
  // rocked gently side to side (not shaken): it enjoys the ride
  static int rockSide = 0, rocks = 0;
  static uint32_t rockAt = 0;
  if (hasMpu && !jolted && !upsideDown) {
    int side = tiltX > 0.3f ? 1 : (tiltX < -0.3f ? -1 : 0);
    if (side && side != rockSide) {
      if (rockSide) { rocks = (now - rockAt < 1300) ? rocks + 1 : 1; rockAt = now; }
      rockSide = side;
    }
    if (rocks >= 3 && act == A_IDLE && !playing) { rocks = 0; tuneHappy(); touchReact("左右摇一摇(好玩)", now, 1500, HAPPY, 0, 0.2f, 0.8f); }
  }

  handleReply(now);
  if (act == A_SLEEP && now > actUntil) { tuneWake(); energy = 1; Serial.println("自己: 睡醒了"); }   // woke up by itself
  if (act != A_IDLE && act != A_LISTEN && now > actUntil) act = A_IDLE;
  innerLife(now, someoneNear, touched || act == A_LISTEN || claps > 0);
  // asleep: only a touch (or "wake up") wakes it — visitors walking past shouldn't
  if (act == A_SLEEP && touched && !prevTouch && now - actStart > 1500) { tuneWake(); act = A_IDLE; noticedAt = now; }

  // --- serial ---
  while (Serial.available()) {
    char c = Serial.read();
    switch (c) {
      case 'n': mood = NEUTRAL; break; case 'h': mood = HAPPY; break;
      case 'z': mood = SLEEPY; break;  case 's': mood = SAD; break; case 'a': mood = ANGRY; break;
      case 'd': debugRange = !debugRange; break;
      case 'v': {                                         // audition every event sound in turn
        static int vi = 0;
        static const char *NAMES[] = {"hello", "pat", "listen", "think", "hm", "look", "happy", "sad",
                                      "startle", "grumpy", "dizzy", "sleep", "wake", "reunion", "offline", "dance", "shy", "purr", "boop", "chirp"};
        static void (*const FN[])() = {tuneHello, tunePat, tuneListen, tuneThink, tuneHm, tuneLook, tuneHappy, tuneSad,
                                       tuneStartle, tuneGrumpy, tuneDizzy, tuneSleep, tuneWake, tuneReunion, tuneOffline, tuneDance,
                                       tuneShy, tunePurr, tuneBoop, tuneChirp};
        Serial.printf("声音 %d/20: %s\n", vi + 1, NAMES[vi]); FN[vi](); vi = (vi + 1) % 20; break;
      }
      case 'e':
        touchFocus = touchFocus >= 11 ? -1 : touchFocus + 1;
        if (touchFocus < 0) Serial.println("触摸监视:看全部 12 路"); else Serial.printf("触摸监视:只看 E%d(再按 e 换下一路)\n", touchFocus);
        touchMon = true; break;
      case 't': touchMon = !touchMon; Serial.println(touchMon ? "触摸监视 开(再按 t 关)" : "触摸监视 关"); break;
      case 'i': Serial.printf("Wi-Fi=%d Pi=%s 倾斜 x=%.2f z=%.2f 触摸=0x%03X 麦=%d act=%d\n", wifiOk,
                              piAddr.toString().c_str(), tiltX, tiltZ, touched, micLevel, act); break;
      case 'p': Serial.printf("Pi 解析 %s → %s\n", resolvePi() ? "ok" : "失败", piAddr.toString().c_str()); break;
#if USE_TOF
      case 'c': if (hasTof) { delay(600); calibrate(); } break;
#endif
      default:
        if (c >= '1' && c <= '6') {
          Note m[MAX_NOTES];
          int fam = c - '1';
          int n = familyMelody(fam, 0.6f, 0.3f, 0.4f, 200, m);
          playNotes(m, n); replyMood = familyMood(fam); startAct(A_REPLY, now, 4000);
        }
    }
  }

  // --- mood ---
  if (act == A_LISTEN || act == A_THINK || act == A_LOOK) mood = NEUTRAL;
  else if (act == A_REPLY) mood = replyMood;
  else if (act == A_SLEEP) mood = SLEEPY;
  else if (act == A_DANCE) mood = HAPPY;
  else if (act == A_TOUCH) mood = touchMood;
  else if (upsideDown)        { mood = DIZZY; moodFromPresence = true; }
  else if (jolted)            { mood = ANGRY; moodFromPresence = true; }
  else if (touched)           { mood = HAPPY; moodFromPresence = true; }
  else if (someoneClose)      { mood = HAPPY; moodFromPresence = true; }
  else if (moodFromPresence && (!someoneNear || mood != NEUTRAL)) { mood = NEUTRAL; moodFromPresence = false; }
  else if (lonely && mood == NEUTRAL) mood = SLEEPY;
  else if (!lonely && mood == SLEEPY && someoneNear) mood = NEUTRAL;

  // --- gaze ---
  float t = now / 1000.0f;
  if (act == A_LISTEN) { tx = 0; ty = -0.45f + (micLevel > 3000 ? 0.12f * sinf(t * 18) : 0); }        // ears up
  else if (act == A_THINK) { tx = 0.6f * cosf(t * 4); ty = 0.4f * sinf(t * 4); }                    // pondering circle
  else if (act == A_REPLY && playingHz > 0) { tx = 0; ty = clampf(0.6f - (playingHz - 300) / 700.0f, -0.7f, 0.7f); } // eyes sing along
  else if (act == A_LOOK) { tx = 0; ty = 0.1f; }
  else if (act == A_DANCE) { tx = sinf(t * 9) > 0 ? 0.8f : -0.8f; ty = 0.2f * cosf(t * 9); }
  else if (act == A_HM) { tx = -0.6f; ty = -0.5f; }
  else if (act == A_TOUCH) { tx = touchLookAround ? 0.7f * sinf(t * 7) : touchTx; ty = touchTy; }
  else if (someoneNear) { tx = 0; ty = 0.15f; nextSaccade = now + 600; }
  else if (justLeft) { tx = 0; ty = -0.45f; nextSaccade = now + 1000; }
  else if (now > nextSaccade) {
    tx = (random(200) - 100) / 100.0f * 0.8f;
    ty = (random(200) - 100) / 100.0f * 0.5f;
    nextSaccade = now + 1500 + random(2500);
  }
  float gazeX = (hasMpu && act == A_IDLE) ? clampf(tx + tiltX * 0.9f, -1, 1) : tx;
  float ease = (startled || jolted || clapped || act == A_DANCE || (act == A_TOUCH && now - actStart < 300)) ? 0.45f : 0.18f;
  px += (gazeX - px) * ease;
  py += (ty - py) * ease;

  // --- blinks ---
  if (act != A_LISTEN && act != A_LOOK && now > nextBlink && blinkStart == 0) {
    blinkStart = now;
    doubleBlink = random(100) < 15;
    nextBlink = now + 2000 + random(4000) + (mood == SLEEPY ? 2500 : 0);
  }
  float open_ = blinkAmt(now);
  if (act == A_SLEEP) open_ = 0.05f;
  else if (mood == SLEEPY) open_ *= 0.72f;
  if (act == A_LISTEN || act == A_LOOK) open_ *= 1.12f;
  if (act == A_TOUCH) open_ *= touchOpen;
  if (peekCovered && act == A_IDLE && now - coverStart < 8000) open_ *= 0.08f;   // hiding behind your hand too
                                                                     // (not forever if something sits on the window)
  if (startled || jolted || clapped) open_ *= 1.18f;
  if (justLeft) open_ *= 0.80f;

  float breath = 1.0f + 0.02f * sinf(now / 7000.0f * TWO_PI);
  drawEye(eyeL, -1, breath, open_);
  drawEye(eyeR, +1, breath, open_);
  delay(12);
}
