/*
 * DeskNote — CYD hello + provisioning sketch
 * Board: ESP32-2432S028R (Cheap Yellow Display, resistive touch variant)
 *
 * What it does:
 *   1. Initialises the 320x240 ILI9341 screen via TFT_eSPI.
 *   2. Connects to Wi-Fi using the SSID / password you fill in below.
 *   3. POSTs to <SERVER_BASE_URL>/api/device/register with the X-Device-Key
 *      provisioning header. The server returns a 6-digit pairing_code, a
 *      device_id (UUID) and a one-time device_token.
 *   4. Displays the server-issued pairing_code on the TFT. That is the code
 *      you type into the DeskNote web app to claim this desk.
 *
 * Required server setup (see also docs/firmware-cyd-setup.md):
 *   - .env.local on the Next.js app must define:
 *       DEVICE_API_KEY=<matches kDeviceApiKey below>
 *       SUPABASE_SERVICE_ROLE_KEY=<Supabase service_role secret>
 *     Restart `next dev` after editing .env.local.
 *   - The ESP32 must be on the same LAN as the dev server, able to reach
 *     kServerBaseUrl (plain HTTP is fine for local dev).
 *
 * Known hello-sketch limitations (we fix these in the real firmware):
 *   - Every reboot registers a brand new device row. The device_token is
 *     printed to Serial but not persisted in NVS, so it's discarded on reset.
 *   - DEVICE_API_KEY is compiled into the binary. Fine for development; in
 *     production we provision once and store only the per-device bearer token.
 *
 * Arduino IDE prerequisites:
 *   - esp32 by Espressif core 3.0.x+, board "ESP32 Dev Module", 4MB flash.
 *   - Library: TFT_eSPI by Bodmer. User_Setup.h must match this board — a
 *     known-good copy lives next to this sketch; copy it over
 *     ~/Documents/Arduino/libraries/TFT_eSPI/User_Setup.h.
 */

#include <Arduino.h>
#include <HTTPClient.h>
#include <TFT_eSPI.h>
#include <WiFi.h>

// ---------------------------------------------------------------------------
// Wi-Fi credentials — replace these two placeholders.
// Do not commit real creds. A proper secrets.h will land with the real
// firmware; the hello sketch keeps it simple.
// ---------------------------------------------------------------------------
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// ---------------------------------------------------------------------------
// DeskNote server configuration.
//
// kServerBaseUrl must be reachable from the ESP32 on your Wi-Fi. For local
// dev that is your Mac's LAN IP + Next.js port — NOT "localhost" and NOT
// "127.0.0.1" (those resolve to the ESP32 itself).
//
// kDeviceApiKey must match DEVICE_API_KEY in the server's .env.local. If they
// differ the server returns HTTP 401 and the sketch shows "AUTH 401".
// ---------------------------------------------------------------------------
const char* kServerBaseUrl   = "http://10.0.0.85:3000";
const char* kDeviceApiKey    = "REPLACE_WITH_DEVICE_API_KEY";
const char* kFirmwareVersion = "hello-0.2";

// ---------------------------------------------------------------------------
// Hardware pins that are NOT driven by TFT_eSPI.
// Backlight sits on GPIO 21 on the common 2432S028R revision. If your
// board stays dark after flashing, try 27.
// ---------------------------------------------------------------------------
static constexpr uint8_t PIN_BACKLIGHT = 21;

// ---------------------------------------------------------------------------
// Timeouts
// ---------------------------------------------------------------------------
static constexpr uint32_t WIFI_CONNECT_TIMEOUT_MS = 20000;
static constexpr uint16_t HTTP_TIMEOUT_MS         = 8000;

// ---------------------------------------------------------------------------
TFT_eSPI tft = TFT_eSPI();

struct RegistrationResult {
  bool   ok;
  int    httpStatus;
  String errorDetail;
  String deviceId;
  String pairingCode;
  String deviceToken;
};

RegistrationResult lastRegistration;

// ---------------------------------------------------------------------------
// Drawing helpers — simple, deliberate, easy to extend.
// ---------------------------------------------------------------------------
void drawHeader() {
  tft.fillScreen(TFT_BLACK);

  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextFont(4);
  tft.setCursor(10, 12);
  tft.print("DeskNote");

  tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
  tft.setTextFont(2);
  tft.setCursor(10, 50);
  tft.print("A tiny message board for two.");
}

void drawPairingCode(const String& code) {
  tft.fillRect(0, 80, tft.width(), 110, TFT_BLACK);

  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  tft.setTextFont(2);
  tft.setCursor(10, 88);
  tft.print("Pairing code");

  // Font 7 is the built-in 7-segment style font; it only renders digits
  // 0-9 (plus ':', '-', '.', ' '). Keep pairingCode numeric.
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextFont(7);
  tft.setCursor(10, 112);
  tft.print(code);
}

void drawPairingError(const String& line1, const String& line2) {
  tft.fillRect(0, 80, tft.width(), 110, TFT_BLACK);

  tft.setTextColor(TFT_RED, TFT_BLACK);
  tft.setTextFont(4);
  tft.setCursor(10, 88);
  tft.print("Provisioning failed");

  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextFont(2);
  tft.setCursor(10, 130);
  tft.print(line1);
  tft.setCursor(10, 150);
  tft.print(line2);
}

void drawStatus(const String& status, uint16_t color = TFT_WHITE) {
  const int16_t y = 205;
  tft.fillRect(0, y - 5, tft.width(), 35, TFT_BLACK);

  tft.setTextColor(color, TFT_BLACK);
  tft.setTextFont(2);
  tft.setCursor(10, y);
  tft.print(status);
}

// ---------------------------------------------------------------------------
// Wi-Fi
// ---------------------------------------------------------------------------
bool connectWifi() {
  Serial.printf("Connecting to %s\n", WIFI_SSID);
  drawStatus("Connecting to Wi-Fi...");

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  const uint32_t started = millis();
  while (WiFi.status() != WL_CONNECTED &&
         millis() - started < WIFI_CONNECT_TIMEOUT_MS) {
    Serial.print('.');
    delay(500);
  }
  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.printf("Wi-Fi failed. status=%d\n", WiFi.status());
    drawStatus("Wi-Fi failed. Check SSID & PW.", TFT_RED);
    return false;
  }

  const IPAddress ip = WiFi.localIP();
  Serial.print(F("Wi-Fi OK. IP: "));
  Serial.println(ip);

  String msg = "Wi-Fi OK  ";
  msg += ip.toString();
  drawStatus(msg, TFT_GREEN);
  return true;
}

// ---------------------------------------------------------------------------
// JSON helpers
//
// The /api/device/register response is a small flat object with three string
// fields: device_id, pairing_code, device_token. A dependency-free extractor
// keeps this sketch library-light. It assumes no escaped quotes in values —
// true for UUIDs, digits, and hex strings.
// ---------------------------------------------------------------------------
bool extractJsonString(const String& json, const char* key, String& out) {
  String needle = "\"";
  needle += key;
  needle += "\":\"";
  const int start = json.indexOf(needle);
  if (start < 0) return false;
  const int valueStart = start + needle.length();
  const int valueEnd   = json.indexOf('"', valueStart);
  if (valueEnd < 0) return false;
  out = json.substring(valueStart, valueEnd);
  return true;
}

bool extractJsonError(const String& json, String& out) {
  return extractJsonString(json, "error", out);
}

// ---------------------------------------------------------------------------
// POST /api/device/register
// ---------------------------------------------------------------------------
RegistrationResult registerWithServer() {
  RegistrationResult r{};
  r.ok = false;
  r.httpStatus = 0;

  if (String(kDeviceApiKey) == "REPLACE_WITH_DEVICE_API_KEY") {
    r.errorDetail = "DEVICE_API_KEY not set";
    return r;
  }

  String url = kServerBaseUrl;
  url += "/api/device/register";

  Serial.printf("POST %s\n", url.c_str());
  drawStatus("Registering with server...");

  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  if (!http.begin(url)) {
    r.errorDetail = "http.begin failed";
    return r;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", kDeviceApiKey);

  String body = "{\"firmware_version\":\"";
  body += kFirmwareVersion;
  body += "\"}";

  const int status = http.POST(body);
  r.httpStatus = status;
  const String payload = http.getString();
  http.end();

  Serial.printf("HTTP %d, body: %s\n", status, payload.c_str());

  if (status != 200) {
    String err;
    if (extractJsonError(payload, err) && err.length()) {
      r.errorDetail = err;
    } else if (status < 0) {
      r.errorDetail = HTTPClient::errorToString(status);
    } else {
      r.errorDetail = "HTTP " + String(status);
    }
    return r;
  }

  if (!extractJsonString(payload, "pairing_code", r.pairingCode) ||
      r.pairingCode.length() != 6) {
    r.errorDetail = "bad response (pairing_code)";
    return r;
  }
  extractJsonString(payload, "device_id", r.deviceId);
  extractJsonString(payload, "device_token", r.deviceToken);

  r.ok = true;
  return r;
}

// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println();
  Serial.println(F("=== DeskNote CYD hello ==="));
  Serial.printf("Chip model: %s, cores: %d\n",
                ESP.getChipModel(), ESP.getChipCores());

  pinMode(PIN_BACKLIGHT, OUTPUT);
  digitalWrite(PIN_BACKLIGHT, HIGH);

  tft.init();
  // Rotation 1 = landscape, USB port on the right.
  // Change to 3 if your USB connector points the other way.
  tft.setRotation(1);

  drawHeader();
  drawStatus("Booting...");

  if (!connectWifi()) {
    drawPairingError("No Wi-Fi — cannot register.",
                     "Check SSID / password and reboot.");
    return;
  }

  lastRegistration = registerWithServer();

  if (!lastRegistration.ok) {
    Serial.printf("Registration failed: %s\n",
                  lastRegistration.errorDetail.c_str());
    String status = "HTTP ";
    status += String(lastRegistration.httpStatus);
    drawPairingError(status, lastRegistration.errorDetail);
    drawStatus("Check server logs + DEVICE_API_KEY.", TFT_RED);
    return;
  }

  Serial.printf("Registered. device_id=%s\n",
                lastRegistration.deviceId.c_str());
  Serial.printf("device_token (save this, shown only once): %s\n",
                lastRegistration.deviceToken.c_str());
  Serial.printf("Pairing code: %s\n", lastRegistration.pairingCode.c_str());

  drawPairingCode(lastRegistration.pairingCode);
  drawStatus("Type this code into DeskNote.", TFT_GREEN);
}

void loop() {
  static uint32_t lastLog = 0;
  const uint32_t now = millis();
  if (now - lastLog > 5000) {
    lastLog = now;
    if (WiFi.status() == WL_CONNECTED) {
      Serial.printf("RSSI: %d dBm, heap free: %u bytes\n",
                    WiFi.RSSI(), (unsigned)ESP.getFreeHeap());
    } else {
      Serial.printf("Wi-Fi dropped (status=%d). Retrying...\n",
                    WiFi.status());
      connectWifi();
    }
  }

  delay(10);
}
