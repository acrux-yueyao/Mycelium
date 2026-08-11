#!/usr/bin/env bash
# MC-01 一键烧录 —— macOS / Linux
#
#   bash tools/flash.sh              # 烧 bench-check(I2C 验货)
#   bash tools/flash.sh bench-audio  # 烧声音链验货
#   bash tools/flash.sh m0-eyes      # 烧眼睛固件
#
# 自动装 arduino-cli + esp32 板包 + 需要的库,自动找串口,烧完直接开串口监视器。
set -euo pipefail

SKETCH="${1:-bench-check}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="$ROOT/firmware/$SKETCH"
FQBN="esp32:esp32:esp32"          # ESP32 Dev Module (WROOM-32)

[ -d "$DIR" ] || { echo "没有这个固件:$SKETCH"; ls "$ROOT/firmware"; exit 1; }

# ---- 1. arduino-cli ----
if ! command -v arduino-cli >/dev/null 2>&1; then
  echo "==> 安装 arduino-cli"
  mkdir -p "$HOME/.local/bin"
  curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh \
    | BINDIR="$HOME/.local/bin" sh
  export PATH="$HOME/.local/bin:$PATH"
  echo '提示:把 export PATH="$HOME/.local/bin:$PATH" 加进 ~/.zshrc 就不用每次设了'
fi

# ---- 2. esp32 板包 ----
if ! arduino-cli core list 2>/dev/null | grep -q '^esp32:esp32'; then
  echo "==> 安装 esp32 板包(第一次要几分钟)"
  arduino-cli config init --overwrite >/dev/null 2>&1 || true
  arduino-cli config add board_manager.additional_urls \
    https://espressif.github.io/arduino-esp32/package_esp32_index.json
  arduino-cli core update-index
  arduino-cli core install esp32:esp32
fi

# ---- 3. 库(只有需要的固件才装) ----
if [ "$SKETCH" != "bench-audio" ]; then
  echo "==> 检查库"
  for lib in "Adafruit GFX Library" "Adafruit SSD1306"; do
    arduino-cli lib list 2>/dev/null | grep -qi "^${lib}" || arduino-cli lib install "$lib"
  done
  if [ "$SKETCH" = "m0-eyes" ]; then
    arduino-cli lib list 2>/dev/null | grep -qi "^Adafruit_VL53L0X" \
      || arduino-cli lib install "Adafruit_VL53L0X"
  fi
fi

# ---- 4. 找串口 ----
echo "==> 找板子"
PORT="$(arduino-cli board list | awk '/(usbserial|SLAB|wchusb|ttyUSB|ttyACM|usbmodem)/ {print $1; exit}')"
if [ -z "$PORT" ]; then
  echo "没找到板子。检查:USB 线是不是充电线(要数据线)、板子插稳没。"
  echo "如果是 CH340 芯片的板子,可能需要装驱动:https://www.wch-ic.com/downloads/CH341SER_ZIP.html"
  echo
  arduino-cli board list
  exit 1
fi
echo "    串口 $PORT"

# ---- 5. 编译 + 烧录 ----
echo "==> 编译 $SKETCH"
arduino-cli compile --fqbn "$FQBN" "$DIR"
echo "==> 烧录"
arduino-cli upload -p "$PORT" --fqbn "$FQBN" "$DIR"

# ---- 6. 串口监视器 ----
echo
echo "==> 串口监视器(115200)  ·  退出按 Ctrl+C"
echo
arduino-cli monitor -p "$PORT" -c baudrate=115200
