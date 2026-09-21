# Over-the-air firmware updates

Desks update themselves from the app — no cable — once they are running
firmware `main-5.0` or later.

## How an update travels

1. **You publish** a build: `./scripts/release-firmware.sh main-5.1 "notes"`.
   It builds, signs with your private key, checks the signature against the
   public key compiled into the firmware, uploads the image to the **private**
   `firmware` bucket, and records a row in `firmware_releases`.
2. **The owner presses Update** on the desk in Settings (iOS or web). That calls
   `request_firmware_update`, which picks the newest release and sets
   `devices.ota_target_version`.
3. **The desk is poked.** The `devices-to-mqtt` trigger calls `mqtt-publish`,
   which sends `{"kind":"sync"}` to the desk's MQTT topic. The desk checks in
   with `/api/device/latest` straight away.
4. **The desk installs.** `/latest` returns `ota_version`, a ten-minute signed
   `ota_url`, `ota_size`, `ota_sha256` and `ota_signature`. The desk streams
   the image into its spare app slot, checks the SHA-256 and the ECDSA P-256
   signature, and only then makes the slot bootable and restarts.
5. **The new build proves itself.** It boots "pending verify". Once it reaches
   the server with a valid token it is confirmed, and `/latest` marks the
   update `updated`. If it crashes or reboots first, the bootloader restores
   the previous build, which reports the failure — the app shows it, and
   Update can be pressed again.

The same MQTT poke now carries theme, name and card changes too, so a desk
on `main-5.0`+ picks those up within seconds instead of at its six-hourly sync.

## One-time setup

- **Back up the signing key.** `~/.desknote/firmware-signing-key.pem` is the
  only thing that can sign an update your desks will accept. It is not in the
  repo and must never be. Lose it and every desk can only be updated over USB.
- **Flash every desk over USB once:** `./scripts/flash-desk.sh`. This moves it
  to the two-1.9 MB-slot partition layout (`PartitionScheme=min_spiffs`) and
  onto firmware that can update itself. Wi-Fi and pairing survive.
  In the Arduino IDE the equivalent is Tools → Partition Scheme →
  "Minimal SPIFFS (1.9MB APP with OTA/190KB SPIFFS)".

## Publishing a release

1. Bump `kFirmwareVersion` in `firmware/desknote_main/desknote_main.ino`.
2. Commit. The script refuses a dirty `firmware/` so every release can be
   rebuilt from git.
3. `./scripts/release-firmware.sh <version> "what changed"`.
   Add `--dry-run` to build and sign without uploading.

A published version is immutable: to fix a bad release, publish a new version.

## Why the bucket is private

The binary has the shared HiveMQ login and `DEVICE_API_KEY` compiled in (from
`secrets.h`), and this repository is public. A public image would hand anyone
the MQTT login, and with it every desk's notes. Desks get a short-lived
signed URL, only for the version they were asked to install.
