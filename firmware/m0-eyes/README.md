# M0 — eyes

The desk companion's first heartbeat: two 0.96" OLEDs running the same
procedural-face rules as the site's creatures — shared 7 s breath, saccades,
blinks, presence reactions.

## Wiring (bench: ESP32 WROOM-32)

| module | pin | ESP32 |
|---|---|---|
| both SSD1306 + VL53L0X | SDA | 21 |
| | SCL | 22 |
| | VCC | 3V3 |
| | GND | GND |

Left eye at I2C `0x3C`, right eye at `0x3D` (solder the address jumper on one
screen). If your batch is fixed at `0x3C`, insert a TCA9548A and wrap the two
`drawEye` calls in channel selects.

## Build

Arduino IDE → board *ESP32 Dev Module*. Install libraries:

- **Adafruit GFX Library**
- **Adafruit SSD1306**
- **Adafruit_VL53L0X** — optional; without it set `#define USE_TOF 0`

Flash at 115200. No ToF connected? It just skips presence and idles happily.

## Behaviour map

| trigger | response |
|---|---|
| idle | breath ±2% on a 7 s sine, random saccades every 1.5–4 s, blink every 2–6 s (15% double) |
| ToF < 350 mm | stops wandering, looks at you |
| ToF < 120 mm | happy squint |
| alone > 60 s | sleepy lids, slower blinks |
| serial keys `n h z s a` | neutral · happy · sleepy · sad · angry — the hook where `/api/emotion` readings will land |
