/*
 * MC-01 面包板验货程序
 *
 * 阶段1(I2C):扫描两条总线,报出每个找到的地址并标注是哪个模块。
 *   总线0(SDA→G21 SCL→G22):左眼屏 + ToF + 姿态 + 触摸
 *   总线1(SDA→G18 SCL→G19):右眼屏(两块屏都保持出厂 0x3C,不用改地址)
 * 阶段2(可选):把下面的 TEST_SCREEN 改成 1,会在屏1画一个方框+文字,
 *   确认屏幕真的能显示(需要装 Adafruit_SSD1306 / Adafruit_GFX 库)。
 */
#include <Wire.h>

#define SDA_PIN  21
#define SCL_PIN  22
#define SDA2_PIN 18
#define SCL2_PIN 19
#define TEST_SCREEN 0     // 改成 1 开启屏幕显示测试

#if TEST_SCREEN
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
Adafruit_SSD1306 eyeL(128, 64, &Wire, -1);
Adafruit_SSD1306 eyeR(128, 64, &Wire1, -1);
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
  Wire1.begin(SDA2_PIN, SCL2_PIN);
  Wire1.setClock(100000);
  Serial.println("\n=== MC-01 面包板验货 ===");

#if TEST_SCREEN
  auto show = [](Adafruit_SSD1306 &d, const char *tag, const char *word) {
    d.clearDisplay();
    d.drawRect(0, 0, 128, 64, SSD1306_WHITE);
    d.setTextSize(2);
    d.setTextColor(SSD1306_WHITE);
    d.setCursor(20, 16);
    d.print(tag);
    d.setCursor(10, 38);
    d.print(word);
    d.display();
  };
  if (eyeL.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    show(eyeL, "L", "MYCELIUM");
    Serial.println("屏1(总线0)已送图 —— 屏上应有方框 + L");
  } else {
    Serial.println("屏1 初始化失败 —— 查总线0 接线");
  }
  if (eyeR.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    show(eyeR, "R", "MYCELIUM");
    Serial.println("屏2(总线1)已送图 —— 屏上应有方框 + R");
  } else {
    Serial.println("屏2 初始化失败 —— 查总线1 接线(SDA=G18 SCL=G19)");
  }
#endif
}

int scan(TwoWire &bus, const char *label) {
  Serial.printf("--- %s ---\n", label);
  int found = 0;
  for (uint8_t addr = 1; addr < 127; addr++) {
    bus.beginTransmission(addr);
    if (bus.endTransmission() == 0) {
      Serial.printf("  0x%02X  %s\n", addr, whois(addr));
      found++;
    }
  }
  if (found == 0) Serial.println("  (空)");
  return found;
}

void loop() {
  Serial.println();
  int a = scan(Wire,  "总线0  SDA=G21 SCL=G22");
  int b = scan(Wire1, "总线1  SDA=G18 SCL=G19");
  if (a + b == 0) {
    Serial.println("两条都是空的:查 3V3/GND 有没有接反,SDA/SCL 有没有插错脚");
  } else {
    Serial.printf("共 %d 个设备(总线0:%d  总线1:%d)\n", a + b, a, b);
  }
  delay(3000);
}
