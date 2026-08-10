/*
 * MC-01 面包板验货程序
 *
 * 阶段1(I2C):扫描总线,报出每个找到的地址并标注是哪个模块。
 *   接线见 hardware 里的面包板电路图:SDA→G21 SCL→G22,模块吃 3V3。
 * 阶段2(可选):把下面的 TEST_SCREEN 改成 1,会在屏1画一个方框+文字,
 *   确认屏幕真的能显示(需要装 Adafruit_SSD1306 / Adafruit_GFX 库)。
 */
#include <Wire.h>

#define SDA_PIN 21
#define SCL_PIN 22
#define TEST_SCREEN 0     // 改成 1 开启屏幕显示测试

#if TEST_SCREEN
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
Adafruit_SSD1306 eyeL(128, 64, &Wire, -1);
#endif

const char* whois(uint8_t a) {
  switch (a) {
    case 0x3C: return "SSD1306 屏1";
    case 0x3D: return "SSD1306 屏2";
    case 0x29: return "VL53L0X 测距";
    case 0x68: return "MPU6050 姿态";
    case 0x5A: return "MPR121 触摸";
    default:   return "未知设备";
  }
}

void setup() {
  Serial.begin(115200);
  delay(400);
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(100000);
  Serial.println("\n=== MC-01 面包板验货 ===");

#if TEST_SCREEN
  if (eyeL.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    eyeL.clearDisplay();
    eyeL.drawRect(0, 0, 128, 64, SSD1306_WHITE);
    eyeL.setTextSize(2);
    eyeL.setTextColor(SSD1306_WHITE);
    eyeL.setCursor(14, 24);
    eyeL.print("MYCELIUM");
    eyeL.display();
    Serial.println("屏1 显示测试:已送图,看屏上有没有方框+字");
  } else {
    Serial.println("屏1 初始化失败 —— 查接线和地址");
  }
#endif
}

void loop() {
  Serial.println("\n--- 扫描 I2C 总线 ---");
  int found = 0;
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.printf("  0x%02X  %s\n", addr, whois(addr));
      found++;
    }
  }
  if (found == 0) {
    Serial.println("  一个都没找到:查 3V3/GND 有没有接反,SDA/SCL 有没有插错脚");
  } else {
    Serial.printf("  共 %d 个设备\n", found);
  }
  delay(3000);
}
