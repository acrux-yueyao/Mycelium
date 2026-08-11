/*
 * MC-01 面包板验货 · 阶段2:声音链
 *
 * 验两件事:
 *   1) MAX98357A + 3020 喇叭能出声(播一段音阶)
 *   2) INMP441 麦克风能收声(串口打条形音量表)
 *
 * 接线见 hardware/bench_circuit.png 下半张:
 *   麦   SCK→G14  WS→G15  SD→G32   VDD→3V3  GND→GND  L/R→GND(必须)
 *   功放 BCLK→G26 LRC→G25 DIN→G27  VIN→3V3  GND→GND  GAIN/SD 悬空
 *
 * 串口 115200,按键:
 *   t  播一次音阶(do re mi fa so)
 *   b  播一声"哔"
 *   m  切换麦克风音量表(默认开)
 */
#include <driver/i2s.h>
#include <math.h>

constexpr int MIC_SCK = 14, MIC_WS = 15, MIC_SD = 32;
constexpr int AMP_BCLK = 26, AMP_LRC = 25, AMP_DIN = 27;

constexpr int SAMPLE_RATE = 16000;
constexpr i2s_port_t PORT_AMP = I2S_NUM_0;
constexpr i2s_port_t PORT_MIC = I2S_NUM_1;

bool meterOn = true;

void setupAmp() {
  i2s_config_t cfg = {};
  cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX);
  cfg.sample_rate = SAMPLE_RATE;
  cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT;
  cfg.channel_format = I2S_CHANNEL_FMT_ONLY_LEFT;
  cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  cfg.intr_alloc_flags = 0;
  cfg.dma_buf_count = 8;
  cfg.dma_buf_len = 256;
  cfg.use_apll = false;
  i2s_pin_config_t pins = {};
  pins.mck_io_num = I2S_PIN_NO_CHANGE;
  pins.bck_io_num = AMP_BCLK;
  pins.ws_io_num = AMP_LRC;
  pins.data_out_num = AMP_DIN;
  pins.data_in_num = I2S_PIN_NO_CHANGE;
  i2s_driver_install(PORT_AMP, &cfg, 0, NULL);
  i2s_set_pin(PORT_AMP, &pins);
}

void setupMic() {
  i2s_config_t cfg = {};
  cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX);
  cfg.sample_rate = SAMPLE_RATE;
  cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT;   // INMP441 送 24bit/32bit 帧
  cfg.channel_format = I2S_CHANNEL_FMT_ONLY_LEFT;    // L/R 接地 = 左声道
  cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  cfg.intr_alloc_flags = 0;
  cfg.dma_buf_count = 4;
  cfg.dma_buf_len = 256;
  cfg.use_apll = false;
  i2s_pin_config_t pins = {};
  pins.mck_io_num = I2S_PIN_NO_CHANGE;
  pins.bck_io_num = MIC_SCK;
  pins.ws_io_num = MIC_WS;
  pins.data_out_num = I2S_PIN_NO_CHANGE;
  pins.data_in_num = MIC_SD;
  i2s_driver_install(PORT_MIC, &cfg, 0, NULL);
  i2s_set_pin(PORT_MIC, &pins);
}

// 播一个正弦音,freq 赫兹,ms 毫秒,vol 0..1
void tone(float freq, int ms, float vol = 0.35f) {
  const int N = 256;
  int16_t buf[N];
  static float phase = 0;
  float step = 2.0f * PI * freq / SAMPLE_RATE;
  int total = SAMPLE_RATE * ms / 1000;
  size_t wrote;
  while (total > 0) {
    int n = min(N, total);
    for (int i = 0; i < n; i++) {
      // 两端做淡入淡出,避免"啪"的爆音
      buf[i] = (int16_t)(sinf(phase) * 26000 * vol);
      phase += step;
      if (phase > 2 * PI) phase -= 2 * PI;
    }
    i2s_write(PORT_AMP, buf, n * sizeof(int16_t), &wrote, portMAX_DELAY);
    total -= n;
  }
  // 收尾清零,喇叭不带直流
  memset(buf, 0, sizeof(buf));
  i2s_write(PORT_AMP, buf, sizeof(buf), &wrote, portMAX_DELAY);
}

void scale() {
  const float notes[] = {262, 294, 330, 349, 392};   // do re mi fa so
  for (float f : notes) { tone(f, 220); delay(40); }
}

void setup() {
  Serial.begin(115200);
  delay(400);
  Serial.println("\n=== MC-01 声音链验货 ===");
  setupAmp();
  setupMic();
  Serial.println("功放:播放音阶 —— 听喇叭");
  scale();
  Serial.println("麦克风:对着麦说话/吹气,下面的条应该变长");
  Serial.println("按键: t=音阶  b=哔  m=开关音量表");
}

void loop() {
  if (Serial.available()) {
    char c = Serial.read();
    if (c == 't') { Serial.println("[播音阶]"); scale(); }
    else if (c == 'b') { Serial.println("[哔]"); tone(880, 150); }
    else if (c == 'm') { meterOn = !meterOn; Serial.printf("[音量表 %s]\n", meterOn ? "开" : "关"); }
  }

  if (!meterOn) { delay(50); return; }

  int32_t samples[256];
  size_t got = 0;
  i2s_read(PORT_MIC, samples, sizeof(samples), &got, 100 / portTICK_PERIOD_MS);
  int n = got / sizeof(int32_t);
  if (n == 0) {
    Serial.println("麦无数据 —— 查 SD/SCK/WS 接线,L/R 是否接地");
    delay(500);
    return;
  }
  long peak = 0;
  for (int i = 0; i < n; i++) {
    long v = samples[i] >> 14;              // 32bit 帧里取有效位
    if (labs(v) > peak) peak = labs(v);
  }
  int bars = constrain((int)(peak / 400), 0, 40);
  Serial.printf("%6ld |", peak);
  for (int i = 0; i < bars; i++) Serial.print('#');
  Serial.println();
  delay(120);
}
