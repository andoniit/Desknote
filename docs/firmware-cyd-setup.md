# ESP32-2432S028R (CYD) — macOS + Arduino IDE setup

A step-by-step guide for getting the **ELEGOO / Sunton Cheap Yellow Display
(ESP32-2432S028R)** talking to DeskNote. We'll install the Arduino IDE, add
the ESP32 board support, wire up the `TFT_eSPI` library, then flash a tiny
"hello DeskNote" sketch that shows the name, a random 6-character pairing
code, and the device's Wi-Fi IP on the screen.

> This is written for the classic **resistive-touch "R" variant** of the
> 2432S028 (most common on AliExpress / Amazon). Hardware pins and driver
> selection below match that board. A few notes are included for the "C"
> (capacitive) variant too.

## 1. What you need

| Item | Notes |
| --- | --- |
| ESP32-2432S028R board | "Cheap Yellow Display", 320×240 ILI9341 + XPT2046 touch |
| USB‑Micro **data** cable | Very common trap: a "charge-only" cable will not show up on macOS |
| macOS 12 Monterey or newer | Works on Ventura/Sonoma/Sequoia too |
| [Arduino IDE 2.x](https://www.arduino.cc/en/software) | Download the Apple Silicon or Intel build that matches your Mac |
| A 2.4 GHz Wi-Fi network | ESP32 does not support 5 GHz |

## 2. Install the USB-serial (CH340) driver

The CYD uses a **CH340G** USB-UART chip. macOS 11+ includes a driver by
default, but it's unreliable — install WCH's signed driver instead:

1. Download the notarized driver from WCH:
   <https://www.wch-ic.com/downloads/CH341SER_MAC_ZIP.html>
2. Run the installer, reboot.
3. (Ventura+) Open **System Settings → Privacy & Security** and click
   **Allow** next to the blocked `wch.cn` system extension.
4. Plug the CYD in. In a Terminal, run:
   ```bash
   ls /dev/cu.*
   ```
   You should see something like `/dev/cu.wchusbserial1420` or
   `/dev/cu.usbserial-14210`. Remember that name — it's your upload port.

## 3. Install ESP32 board support in Arduino IDE

1. Open **Arduino IDE → Settings…**.
2. In **Additional boards manager URLs**, paste:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
   (If you already have other URLs, add this one separated by a comma.)
3. Click **OK**.
4. Open **Tools → Board → Boards Manager…**, search for **esp32** and install
   **"esp32" by Espressif Systems** (use 3.0.x or newer).
5. Restart the Arduino IDE after the install completes.

## 4. Select the board and port

Under **Tools**, pick these exact values:

| Setting | Value |
| --- | --- |
| Board | **ESP32 Dev Module** (*Tools → Board → esp32 → ESP32 Dev Module*) |
| Upload Speed | **921600** (drop to 460800 if uploads are flaky) |
| CPU Frequency | 240 MHz (WiFi/BT) |
| Flash Frequency | 80 MHz |
| Flash Mode | **QIO** (switch to **DIO** if the board resets on boot) |
| Flash Size | **4MB (32Mb)** |
| Partition Scheme | **Default 4MB with spiffs** |
| PSRAM | **Disabled** (the 2432S028R has no PSRAM) |
| Core Debug Level | None |
| Port | the `/dev/cu.wchusbserial…` entry you saw in step 2 |

## 5. Install the `TFT_eSPI` library

1. In Arduino IDE open **Sketch → Include Library → Manage Libraries…**.
2. Search for **TFT_eSPI** and install **"TFT_eSPI" by Bodmer**
   (2.5.x or newer).
3. Locate the installed library on disk — on macOS it's:
   ```
   ~/Documents/Arduino/libraries/TFT_eSPI/
   ```

### 5a. Configure `TFT_eSPI` for CYD

`TFT_eSPI` picks its pin map from a header called `User_Setup.h` inside
the library folder. We need to point it at the CYD.

1. Back up the original file:
   ```bash
   cd ~/Documents/Arduino/libraries/TFT_eSPI
   cp User_Setup.h User_Setup.h.bak
   ```
2. Replace the contents of `User_Setup.h` with the block below — it's the
   known-good pin mapping for the 2432S028R. The same file is also saved in
   this repo at `firmware/desknote_hello/User_Setup.h` so you can just copy
   it.
   ```cpp
   #define USER_SETUP_INFO "DeskNote / ESP32-2432S028R"

   // 2432S028R uses the ILI9341 with slightly different init sequence —
   // ILI9341_2_DRIVER is the variant that matches the CYD panel.
   #define ILI9341_2_DRIVER

   #define TFT_WIDTH  240
   #define TFT_HEIGHT 320

   // Panel (HSPI)
   #define TFT_MISO 12
   #define TFT_MOSI 13
   #define TFT_SCLK 14
   #define TFT_CS   15
   #define TFT_DC    2
   #define TFT_RST  -1       // tied to EN on this board
   #define TFT_BL   21       // backlight; switch to 27 for "R2" rev boards
   #define TFT_BACKLIGHT_ON HIGH

   // Resistive touch (XPT2046) shares the SPI bus
   #define TOUCH_CS 33

   // Fonts
   #define LOAD_GLCD
   #define LOAD_FONT2
   #define LOAD_FONT4
   #define LOAD_FONT6
   #define LOAD_FONT7
   #define LOAD_FONT8
   #define LOAD_GFXFF
   #define SMOOTH_FONT

   #define SPI_FREQUENCY       55000000
   #define SPI_READ_FREQUENCY  20000000
   #define SPI_TOUCH_FREQUENCY  2500000

   #define USE_HSPI_PORT
   ```
3. Save the file. Close and re-open the Arduino IDE so the library is
   re-read.

> **Capacitive ("C") variant?** Use `ILI9341_DRIVER` (no `_2`) and set
> `#define TFT_BL 27`. The touch chip is GT911 on I²C, which this library
> doesn't support out of the box; you can still use the screen, just without
> touch for now.

## 6. Paste the DeskNote hello sketch

Copy `firmware/desknote_hello/desknote_hello.ino` from this repo into a new
Arduino sketch (or open the folder directly with **File → Open**). Fill in
the four constants near the top of the file:

```cpp
const char* WIFI_SSID        = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD    = "YOUR_WIFI_PASSWORD";
const char* kServerBaseUrl   = "http://10.0.0.85:3000"; // your Mac's LAN IP + Next port
const char* kDeviceApiKey    = "REPLACE_WITH_DEVICE_API_KEY";
```

`kServerBaseUrl` must be reachable from the ESP32. Use your Mac's LAN IP
(e.g. `http://10.0.0.85:3000`) — **not** `localhost` or `127.0.0.1`, which
resolve to the ESP32 itself. `kDeviceApiKey` must match the
`DEVICE_API_KEY` value in your running server's `.env.local` (see
section 6a below).

Then click **Verify** (✓). The first compile takes a minute because Arduino
has to build the ESP32 core.

### 6a. Make sure the server can provision

The hello sketch calls `POST /api/device/register` on boot. The server
route requires two env vars — set them in `.env.local` at the repo root
before you start `next dev`:

```bash
# Any long random string; the ESP32 sends it as X-Device-Key.
DEVICE_API_KEY=$(openssl rand -hex 24)

# Supabase Dashboard → Project Settings → API → service_role secret.
# Needed so the register route can INSERT into public.devices past RLS.
SUPABASE_SERVICE_ROLE_KEY=<service_role secret>
```

Paste the same `DEVICE_API_KEY` value into the sketch's `kDeviceApiKey`.
**Restart** `next dev` after editing `.env.local` (Next only reads env at
startup).

Quick sanity check from your Mac, before flashing:

```bash
curl -i -X POST http://10.0.0.85:3000/api/device/register \
  -H "X-Device-Key: $DEVICE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"firmware_version":"curl-check"}'
```

You should get `HTTP/1.1 200 OK` and a JSON body with `device_id`,
`pairing_code` and `device_token`. If you get `401 unauthorized`,
`DEVICE_API_KEY` doesn't match; if you get `500 insert_failed`,
`SUPABASE_SERVICE_ROLE_KEY` is missing or wrong.

## 7. Upload

1. Plug in the CYD.
2. **Tools → Port** → pick the `/dev/cu.wchusbserial…` entry.
3. Click **Upload** (→).
4. If the upload hangs on `Connecting…`, press and hold the tiny **BOOT**
   button on the back of the CYD, tap **RESET**, release **BOOT**. Try
   again. Some boards need this dance once.

On success you'll see output ending in `Hard resetting via RTS pin…`.

## 8. What you should see

- Screen: dark background with **DeskNote** across the top, **Pairing
  code** above a big 6‑digit number rendered in the 7‑segment font, and a
  status line at the bottom that ends in green
  *"Type this code into DeskNote."* If registration fails you'll see a red
  **Provisioning failed** block with the HTTP status and a short reason.
- Serial Monitor (baud **115200**):
  ```
  === DeskNote CYD hello ===
  Connecting to Your-SSID
  ...........
  Wi-Fi OK. IP: 192.168.1.48
  POST http://10.0.0.85:3000/api/device/register
  HTTP 200, body: {"device_id":"…","pairing_code":"048217","device_token":"…"}
  Registered. device_id=…
  device_token (save this, shown only once): …
  Pairing code: 048217
  RSSI: -58 dBm, heap free: 254624 bytes
  ```

**Save the `device_token`** the first time you flash: it's returned only
once by `/api/device/register` and the hello sketch doesn't yet persist it
to NVS, so it'll be gone after a reset. The real firmware will store it
and reuse it for all subsequent `/api/device/*` calls.

## 9. Troubleshooting

### USB port not showing up in **Tools → Port**

- Cable is charge-only. Swap for a known data cable (if you see the board
  light up but macOS never pops a notification, this is almost always the
  reason).
- Driver not loaded. Run `ls /dev/cu.*` — no `wchusbserial` entry means the
  CH340 kext isn't loaded. Re-run the WCH installer, reboot, and check
  **System Settings → Privacy & Security** for a pending *"Allow"* prompt.
- Some USB-C hubs/docks break flow control for the CH340. Plug directly
  into the Mac for the first upload.

### "Failed to connect to ESP32: Timed out waiting for packet header"

- **BOOT-RESET dance**: hold **BOOT**, tap **RESET**, release **BOOT**,
  hit **Upload** within a couple of seconds.
- Lower upload speed from **921600** to **460800** in **Tools → Upload
  Speed**.
- Disconnect anything wired to GPIO 0 or GPIO 2 (shouldn't apply on a
  stock CYD, but worth checking if you've added jumpers).

### Blank / white screen but upload succeeded

- Confirm `User_Setup.h` has `ILI9341_2_DRIVER` defined (not
  `ILI9341_DRIVER`). The init sequence is different — the plain driver
  leaves the CYD backlit-white.
- Backlight isn't on. Make sure `TFT_BL 21` matches your board; some
  later revisions use GPIO 27.
- Set `digitalWrite(PIN_BACKLIGHT, HIGH)` before `tft.init()` — a few
  CYD revisions brown-out the panel if the backlight stays floating
  during init.

### Text looks mirrored / rotated 90° wrong

- Call `tft.setRotation(0);` / `1` / `2` / `3` in `setup()` until it
  looks right. Rotation **1** gives landscape with the USB port on the
  **right** side, which is what DeskNote assumes.
- Colors inverted (red ↔ blue)? Add `tft.invertDisplay(true);` after
  `tft.init();`, or change `TFT_RGB_ORDER` in `User_Setup.h` to
  `TFT_BGR`.

### Wi-Fi never connects

- ESP32 is 2.4 GHz only. If your SSID is 5 GHz, switch your phone to 2.4
  GHz and re-check the SSID spelling — yes, SSIDs are case-sensitive.
- Passwords with non-ASCII characters can fail silently. Try a test SSID
  with plain ASCII to isolate.
- WPA3-only networks aren't supported by the stock Arduino ESP32 core in
  3.0.x. Set the network to *WPA2/WPA3 mixed* on the router.
- Serial Monitor shows `WiFi connect failed` quickly? Your Mac captive
  portal Wi-Fi (cafe-style) won't let the ESP32 finish the handshake.
  Use a home / hotspot network for first tests.
- Status codes reference:
  - `WL_IDLE_STATUS 0`, `WL_NO_SSID_AVAIL 1`, `WL_SCAN_COMPLETED 2`,
    `WL_CONNECTED 3`, `WL_CONNECT_FAILED 4`, `WL_CONNECTION_LOST 5`,
    `WL_DISCONNECTED 6`. You can log `WiFi.status()` inside the wait loop
    to narrow down the reason.

### Provisioning failed (red box on the CYD)

- **HTTP 401 / `unauthorized`** — `kDeviceApiKey` in the sketch doesn't
  match `DEVICE_API_KEY` in `.env.local`, or the server hasn't been
  restarted since you added the env var.
- **HTTP 500 / `insert_failed`** — `SUPABASE_SERVICE_ROLE_KEY` is missing
  or wrong; the insert into `public.devices` is being blocked by RLS.
  Copy the service_role secret from the Supabase Dashboard and restart
  `next dev`.
- **HTTP < 0 / "connection refused"** — the ESP32 can't reach
  `kServerBaseUrl`. Confirm both devices are on the same Wi-Fi SSID, that
  `next dev` is running (`npm run dev`), and that `curl http://<mac-ip>:3000`
  works from another device on the network. On macOS you may need to
  allow incoming connections for Node in **System Settings → Network →
  Firewall**.
- **`DEVICE_API_KEY not set`** — you flashed without replacing the
  `REPLACE_WITH_DEVICE_API_KEY` placeholder in the sketch.

## 10. Where to go next

- Open the DeskNote web app, sign in, visit **Devices → Pair a display**,
  and enter the 6‑digit code the CYD is showing. Because the hello sketch
  registered the device with the server on boot, the claim flow should
  succeed immediately.
- Every reboot of the hello sketch creates a new `devices` row and a
  fresh pairing code. The real firmware will persist the first
  `device_token` in NVS and skip re-registration on subsequent boots.
- When you're ready to replace this hello sketch with the real DeskNote
  firmware, the CYD config you just saved will be reused unchanged.
