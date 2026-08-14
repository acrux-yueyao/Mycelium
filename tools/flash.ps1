# MC-01 一键烧录 —— Windows PowerShell
#
#   .\tools\flash.ps1              # 烧 bench-check(I2C 验货)
#   .\tools\flash.ps1 bench-audio  # 烧声音链验货
#   .\tools\flash.ps1 m0-eyes      # 烧眼睛固件
#
# 第一次运行如果提示"禁止运行脚本",先执行:
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

param([string]$Sketch = "bench-check")
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Dir  = Join-Path $Root "firmware\$Sketch"
$Fqbn = "esp32:esp32:esp32"

if (-not (Test-Path $Dir)) {
  Write-Host "没有这个固件:$Sketch"
  Get-ChildItem (Join-Path $Root "firmware") | Select-Object Name
  exit 1
}

# ---- 1. arduino-cli ----
if (-not (Get-Command arduino-cli -ErrorAction SilentlyContinue)) {
  Write-Host "==> 安装 arduino-cli"
  $bin = "$env:USERPROFILE\arduino-cli"
  New-Item -ItemType Directory -Force -Path $bin | Out-Null
  $zip = "$env:TEMP\arduino-cli.zip"
  Invoke-WebRequest -Uri "https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_Windows_64bit.zip" -OutFile $zip
  Expand-Archive -Path $zip -DestinationPath $bin -Force
  $env:PATH = "$bin;$env:PATH"
  Write-Host "提示:把 $bin 加进系统 PATH 就不用每次设了"
}

# ---- 2. esp32 板包 ----
if (-not (arduino-cli core list 2>$null | Select-String "^esp32:esp32")) {
  Write-Host "==> 安装 esp32 板包(第一次要几分钟)"
  arduino-cli config init --overwrite | Out-Null
  arduino-cli config add board_manager.additional_urls `
    https://espressif.github.io/arduino-esp32/package_esp32_index.json
  arduino-cli core update-index
  arduino-cli core install esp32:esp32
}

# ---- 3. 库 ----
if ($Sketch -ne "bench-audio") {
  Write-Host "==> 检查库"
  foreach ($lib in @("Adafruit GFX Library", "Adafruit SSD1306")) {
    if (-not (arduino-cli lib list 2>$null | Select-String -SimpleMatch $lib)) {
      arduino-cli lib install $lib
    }
  }
  if ($Sketch -eq "m0-eyes") {
    if (-not (arduino-cli lib list 2>$null | Select-String -SimpleMatch "Adafruit_VL53L0X")) {
      arduino-cli lib install "Adafruit_VL53L0X"
    }
  }
}

# ---- 4. 找串口 ----
Write-Host "==> 找板子"
$Port = (arduino-cli board list | Select-String "^COM\d+" | ForEach-Object { $_.Line.Split(" ")[0] } | Select-Object -First 1)
if (-not $Port) {
  Write-Host "没找到板子。检查:USB 线是不是充电线(要数据线)、板子插稳没。"
  Write-Host "CH340 芯片的板子可能要装驱动:https://www.wch-ic.com/downloads/CH341SER_ZIP.html"
  arduino-cli board list
  exit 1
}
Write-Host "    串口 $Port"

# ---- 5. 编译 + 烧录 ----
Write-Host "==> 编译 $Sketch"
arduino-cli compile --fqbn $Fqbn $Dir
Write-Host "==> 烧录"
arduino-cli upload -p $Port --fqbn $Fqbn $Dir

# ---- 6. 串口监视器 ----
Write-Host ""
Write-Host "==> 串口监视器(115200) · 退出按 Ctrl+C"
arduino-cli monitor -p $Port -c baudrate=115200
