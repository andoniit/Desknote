#!/bin/bash
# Flash DeskNote firmware onto a desk over USB.
#
#   ./scripts/flash-desk.sh                        # auto-detect the port
#   ./scripts/flash-desk.sh /dev/cu.usbserial-110  # or name it
#
# Every desk needs this once to move onto the over-the-air layout: two 1.9 MB
# app slots (PartitionScheme=min_spiffs) and a build that can update itself.
# After that, releases arrive from scripts/release-firmware.sh and the app's
# Update button — no cable.
#
# Wi-Fi and pairing survive: NVS sits at 0x9000 in both the old and the new
# partition table, and nothing here erases it.
set -euo pipefail
cd "$(dirname "$0")/.."

FQBN="esp32:esp32:esp32:PartitionScheme=min_spiffs"
SKETCH_DIR="firmware/desknote_main"

PORT="${1:-}"
if [ -z "$PORT" ]; then
  PORT=$(ls /dev/cu.usbserial-* /dev/cu.wchusbserial* /dev/cu.SLAB_USBtoUART* 2>/dev/null | head -1 || true)
  [ -n "$PORT" ] || { echo "No desk found on USB. Plug it in, or pass the port: $0 /dev/cu.…"; exit 1; }
fi
[ -f "$SKETCH_DIR/secrets.h" ] || { echo "no $SKETCH_DIR/secrets.h — copy secrets.example.h and fill it in"; exit 1; }

echo "Flashing $(sed -nE 's/^const char\* kFirmwareVersion = "([^"]*)";/\1/p' "$SKETCH_DIR/desknote_main.ino") to $PORT…"
arduino-cli compile --fqbn "$FQBN" --upload --port "$PORT" "$SKETCH_DIR"
echo "Done. The desk reboots, reconnects, and reports its new version to the app."
