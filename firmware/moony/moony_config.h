// Moony — settings you change on site. Everything else lives in moony.ino.
#pragma once

// Phone hotspot that both Moony and the tower's Pi 5 join.
#define WIFI_SSID     "your-hotspot-name"
#define WIFI_PASS     "your-hotspot-password"

// The tower Pi running scripts/moony-listen. Moony first asks mDNS for
// PI_HOSTNAME.local; if that fails it falls back to PI_IP.
#define PI_HOSTNAME   "tower"
#define PI_IP         "172.20.10.2"
#define PI_PORT       8766

// Which touch electrodes start "hold to talk" (bit n = E n on J7).
// Default E0 = top of the head. Several: (1<<0)|(1<<3)
#define TALK_ELECTRODES  (1 << 0)

// A press shorter than this is a pat (happy squint), longer starts listening.
#define TALK_HOLD_MS     600
// Longest recording, in milliseconds.
#define LISTEN_MAX_MS    6000

// Speaker loudness, 0..1. The amp runs off 3V3, so leave headroom.
#define VOLUME           0.40f
