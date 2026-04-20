/*
 * DeskNote — CYD hello sketch (register + poll + render)
 * Board: ESP32-2432S028R (Cheap Yellow Display, resistive touch variant)
 *
 * Flow:
 *   1. Connect to Wi-Fi.
 *   2. Load device_id + device_token from NVS (ESP32 Preferences).
 *      If missing, POST /api/device/register with the X-Device-Key header,
 *      then save the returned credentials to NVS. First boot also keeps the
 *      pairing_code in RAM so we can display it until the desk is claimed.
 *   3. Poll GET /api/device/latest?deviceId=<uuid> every POLL_INTERVAL_MS
 *      with Authorization: Bearer <device_token>. The response is one of:
 *         - {"message":null,"reason":"unpaired"} — desk not yet claimed.
 *         - {"message":null}                     — paired, no new note.
 *         - {"message":{"id":"<uuid>","body":"<text>",...}} — new note.
 *   4. On a new note, render the body on the TFT, then POST /api/device/seen
 *      so it clears from the queue.
 *   5. On HTTP 401 (token invalid / desk deleted in DB), wipe NVS and
 *      re-register.
 *
 * Required server setup (see also docs/firmware-cyd-setup.md):
 *   - .env.local on the Next.js app must define DEVICE_API_KEY and
 *     SUPABASE_SERVICE_ROLE_KEY, then `next dev` must be restarted.
 *   - The ESP32 must be on the same LAN as the dev server and able to reach
 *     kServerBaseUrl (plain HTTP is fine for local dev).
 *   - Apply supabase/migrations/20260420000000_devices_drop_legacy_not_nulls.sql
 *     so the register INSERT doesn't trip over legacy NOT NULL columns.
 *
 * Arduino IDE prerequisites:
 *   - esp32 by Espressif core 3.0.x+, board "ESP32 Dev Module", 4MB flash.
 *   - Library: TFT_eSPI by Bodmer. User_Setup.h next to this sketch must be
 *     copied over ~/Documents/Arduino/libraries/TFT_eSPI/User_Setup.h.
 */

#include <Arduino.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <TFT_eSPI.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

// ---------------------------------------------------------------------------
// Wi-Fi credentials — replace the two placeholders.
// ---------------------------------------------------------------------------
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// ---------------------------------------------------------------------------
// DeskNote server configuration.
//
// kServerBaseUrl must be reachable from the ESP32 on your Wi-Fi. For local
// dev that is your Mac's LAN IP + Next.js port — NOT "localhost" and NOT
// "127.0.0.1" (those resolve to the ESP32 itself). For production, point at
// your HTTPS deployment ("https://desknote.space").
//
// kDeviceApiKey must match DEVICE_API_KEY set in your server environment
// (.env.local for `next dev`, Vercel project env vars for production). If
// they differ the server returns HTTP 401 from /api/device/register.
// ---------------------------------------------------------------------------
const char* kServerBaseUrl   = "https://desknote.space";
const char* kDeviceApiKey    = "REPLACE_WITH_DEVICE_API_KEY";
const char* kFirmwareVersion = "hello-0.6";

// ---------------------------------------------------------------------------
// Debug: set to 1 to wipe saved credentials on boot and re-register. Leave at
// 0 in normal operation so the desk keeps its identity across reboots.
// ---------------------------------------------------------------------------
#define FORCE_REREGISTER 0

// ---------------------------------------------------------------------------
// Timings + hardware
//
// WAIT_TIMEOUT_MS must exceed the server's long-poll window (25 s) so the
// server gets to return {message:null} cleanly before the ESP32 aborts.
// IDLE_GUARD_MS is a tiny delay between consecutive /wait calls so we don't
// hammer the server while it's erroring (e.g. 401 after a token wipe).
// ---------------------------------------------------------------------------
static constexpr uint8_t  PIN_BACKLIGHT           = 21;
static constexpr uint32_t WIFI_CONNECT_TIMEOUT_MS = 20000;
static constexpr uint32_t HTTP_TIMEOUT_MS         = 30000;
static constexpr uint32_t IDLE_GUARD_MS           = 500;
static constexpr uint32_t ERROR_BACKOFF_MS        = 5000;

// ---------------------------------------------------------------------------
TFT_eSPI    tft = TFT_eSPI();
Preferences prefs;

// Persistent credentials (saved to NVS after /register succeeds).
struct DeviceCredentials {
  String deviceId;
  String deviceToken;
};
DeviceCredentials creds;

// One reusable TLS client; setInsecure() skips CA verification, which keeps
// the firmware tiny (no bundled cert) at the cost of trusting whatever
// answers on kServerBaseUrl. Auth is end-to-end via the bearer token /
// X-Device-Key, so a hostile MitM can't impersonate a registered desk
// without also stealing those secrets - acceptable trade-off for an MVP.
WiFiClientSecure tlsClient;

// Result types declared up here (above any function that returns them) so
// Arduino IDE's auto-generated function prototypes — which get spliced in
// right below the #includes — don't reference undeclared types. This block
// MUST stay above the first non-trivial function definition in the file.
struct RegistrationResult {
  bool   ok;
  int    httpStatus;
  String errorDetail;
  String deviceId;
  String pairingCode;
  String deviceToken;
};

struct LatestResult {
  bool   ok;
  int    httpStatus;
  bool   unpaired;
  bool   hasMessage;
  String messageId;
  String messageBody;
  // Paired-state context (may be empty strings if the server didn't supply).
  String deskName;
  String deskLocation;
  String ownerName;
  String themeId;
  String accentId; // JSON key accent_color
};

// First-boot-only: the pairing code we just got back from /register. We
// display this while the desk is still unpaired. Lost on reboot by design —
// once the desk is paired the server returns `unpaired: false` so we don't
// need it anymore.
String bootPairingCode;

// Track the note we're currently rendering so we only redraw on change.
String currentNoteId;

enum class DisplayState {
  Boot,
  Unpaired,
  WaitingForNote,
  ShowingMessage,
  Error,
};
DisplayState displayState = DisplayState::Boot;

bool isHttpsUrl(const String& url) {
  return url.startsWith("https://") || url.startsWith("HTTPS://");
}

// Wrapper around HTTPClient::begin that picks plain HTTP or TLS depending
// on the URL scheme. Returns the same bool that http.begin returns so the
// callers' early-return paths stay identical.
bool beginHttp(HTTPClient& http, const String& url) {
  if (isHttpsUrl(url)) {
    tlsClient.setInsecure();
    return http.begin(tlsClient, url);
  }
  return http.begin(url);
}

// ---------------------------------------------------------------------------
// NVS persistence (namespace "desknote")
// ---------------------------------------------------------------------------
void loadCreds() {
  prefs.begin("desknote", /*readOnly=*/true);
  creds.deviceId    = prefs.getString("device_id", "");
  creds.deviceToken = prefs.getString("device_token", "");
  prefs.end();
}

void saveCreds(const DeviceCredentials& c) {
  prefs.begin("desknote", /*readOnly=*/false);
  prefs.putString("device_id", c.deviceId);
  prefs.putString("device_token", c.deviceToken);
  prefs.end();
}

void wipeCreds() {
  prefs.begin("desknote", /*readOnly=*/false);
  prefs.clear();
  prefs.end();
  creds = {};
}

bool hasCreds() {
  return creds.deviceId.length() > 0 && creds.deviceToken.length() > 0;
}

// ---------------------------------------------------------------------------
// JSON helpers — small, dependency-free, handles common string escapes.
// Adequate for the flat JSON shapes DeskNote returns today.
// ---------------------------------------------------------------------------
bool extractJsonString(const String& json, const char* key, String& out) {
  String needle = "\"";
  needle += key;
  needle += "\":";

  int p = json.indexOf(needle);
  if (p < 0) return false;
  p += needle.length();

  while (p < (int)json.length() && isspace((unsigned char)json[p])) p++;
  if (p >= (int)json.length() || json[p] != '"') return false;
  p++;

  out = "";
  while (p < (int)json.length()) {
    char c = json[p];
    if (c == '"') return true;
    if (c == '\\' && p + 1 < (int)json.length()) {
      char esc = json[p + 1];
      switch (esc) {
        case '"':  out += '"';  break;
        case '\\': out += '\\'; break;
        case '/':  out += '/';  break;
        case 'n':  out += '\n'; break;
        case 'r':  out += '\r'; break;
        case 't':  out += '\t'; break;
        case 'b':  out += ' ';  break;
        case 'f':  out += ' ';  break;
        case 'u':
          // We don't fully decode \uXXXX; show a placeholder so the rest of
          // the body still reads. Enough for hello-sketch testing.
          if (p + 5 < (int)json.length()) {
            out += '?';
            p += 4;
          }
          break;
        default:
          out += esc;
          break;
      }
      p += 2;
    } else {
      out += c;
      p += 1;
    }
  }
  return false;
}

bool jsonContainsKeyValue(const String& json, const char* key, const char* value) {
  String needle = "\"";
  needle += key;
  needle += "\":\"";
  needle += value;
  needle += "\"";
  return json.indexOf(needle) >= 0;
}

// Desk theme + accent from the web app (matches lib/devices/themes + accents).
// TFT is 16-bit; these are rough approximations of the app's palette.
String gThemeId   = "cream";
String gAccentId  = "";

struct ThemePalette {
  uint16_t bg;
  uint16_t headerBar;
  uint16_t accent;
  uint16_t title;
  uint16_t body;
  uint16_t subtle;
};

ThemePalette paletteForDesk() {
  ThemePalette p{};
  const String& t = gThemeId.length() ? gThemeId : String("cream");
  const String& a = gAccentId;

  auto accentFromId = [&](const String& id) -> uint16_t {
    if (id == "rose") return 0xF813;
    if (id == "blush") return 0xEC9D;
    if (id == "plum") return 0x801F;
    if (id == "sage") return 0x3529;
    if (id == "cream") return 0xBDD7;
    return 0xF813;
  };

  uint16_t acc = accentFromId(a.length() ? a : String("rose"));

  if (t == "blush") {
    p.bg = 0x2008;
    p.headerBar = 0x380C;
    p.accent = acc;
    p.title = 0xFFFF;
    p.body = 0xFFDD;
    p.subtle = 0xC99A;
  } else if (t == "plum") {
    p.bg = 0x0804;
    p.headerBar = 0x1806;
    p.accent = acc;
    p.title = 0xFFFF;
    p.body = 0xF79E;
    p.subtle = 0xB5B6;
  } else if (t == "sage") {
    p.bg = 0x0208;
    p.headerBar = 0x032C;
    p.accent = acc;
    p.title = 0xFFFF;
    p.body = 0xE6F2;
    p.subtle = 0x8C99;
  } else {
    // cream (default)
    p.bg = 0x0000;
    p.headerBar = 0x1082;
    p.accent = acc;
    p.title = 0xFFFF;
    p.body = 0xF79E;
    p.subtle = 0x8C71;
  }
  return p;
}

// TFT fonts are mostly Latin-1; multi-byte UTF-8 (emoji) won't render. Map
// common sequences to ASCII so hearts and sparkles still read as intent.
String printableNoteBody(const String& in) {
  String out;
  out.reserve(in.length() + 8);
  for (size_t i = 0; i < in.length();) {
    const uint8_t b0 = (uint8_t)in[i];

    // U+2764 HEART (E2 9D A4) optional U+FE0F (EF B8 8F)
    if (i + 2 < in.length() && b0 == 0xE2 && (uint8_t)in[i + 1] == 0x9D &&
        (uint8_t)in[i + 2] == 0xA4) {
      out += "<3";
      i += 3;
      if (i + 2 < in.length() && (uint8_t)in[i] == 0xEF &&
          (uint8_t)in[i + 1] == 0xB8 && (uint8_t)in[i + 2] == 0x8F)
        i += 3;
      continue;
    }
    // U+2728 SPARKLES (E2 9C A8)
    if (i + 2 < in.length() && b0 == 0xE2 && (uint8_t)in[i + 1] == 0x9C &&
        (uint8_t)in[i + 2] == 0xA8) {
      out += " * ";
      i += 3;
      continue;
    }
    // U+2014 em dash etc. -> ASCII
    if (i + 2 < in.length() && b0 == 0xE2 && (uint8_t)in[i + 1] == 0x80 &&
        (uint8_t)in[i + 2] == 0x94) {
      out += "-";
      i += 3;
      continue;
    }

    if (b0 < 0x80) {
      out += (char)b0;
      i += 1;
      continue;
    }

    // Skip well-formed UTF-8 non-ASCII (letters with accents, emoji, etc.)
    size_t skip = 1;
    if ((b0 & 0xE0) == 0xC0 && i + 1 < in.length())
      skip = 2;
    else if ((b0 & 0xF0) == 0xE0 && i + 2 < in.length())
      skip = 3;
    else if ((b0 & 0xF8) == 0xF0 && i + 3 < in.length())
      skip = 4;
    out += '?';
    i += skip;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------
void drawChromeHeader() {
  ThemePalette pal = paletteForDesk();
  tft.fillScreen(pal.bg);
  tft.fillRoundRect(0, 0, tft.width(), 52, 10, pal.headerBar);

  tft.setTextColor(pal.title, pal.headerBar);
  tft.setTextFont(4);
  tft.setCursor(12, 10);
  tft.print("DeskNote");

  tft.setTextColor(pal.subtle, pal.headerBar);
  tft.setTextFont(2);
  tft.setCursor(12, 34);
  tft.print("For two");

  // Firmware build — matches kFirmwareVersion; server syncs via X-Firmware-Version.
  const String ver = kFirmwareVersion;
  tft.setTextFont(2);
  const int16_t tw = tft.textWidth(ver.c_str());
  tft.setTextColor(pal.accent, pal.headerBar);
  tft.setCursor(tft.width() - tw - 10, 14);
  tft.print(ver);
}

void drawStatus(const String& status, uint16_t color = TFT_WHITE) {
  ThemePalette pal = paletteForDesk();
  const int16_t y = 210;
  tft.fillRect(0, y - 5, tft.width(), 35, pal.bg);

  tft.setTextColor(color, pal.bg);
  tft.setTextFont(2);
  tft.setCursor(10, y);
  tft.print(status);
}

void clearBody() {
  ThemePalette pal = paletteForDesk();
  tft.fillRect(0, 58, tft.width(), 152, pal.bg);
}

void drawPairingCode(const String& code) {
  drawChromeHeader();
  ThemePalette pal = paletteForDesk();
  clearBody();

  tft.setTextColor(pal.accent, pal.bg);
  tft.setTextFont(2);
  tft.setCursor(10, 70);
  tft.print("Pairing code");

  // Font 7 is the built-in 7-segment style font; digits-only. Our pairing
  // codes are 6 decimal digits, which matches.
  tft.setTextColor(pal.title, pal.bg);
  tft.setTextFont(7);
  tft.setCursor(10, 96);
  tft.print(code);
}

void drawWaitingForNote(const String& deskName,
                        const String& deskLocation,
                        const String& ownerName) {
  drawChromeHeader();
  ThemePalette pal = paletteForDesk();
  clearBody();

  tft.setTextColor(pal.accent, pal.bg);
  tft.setTextFont(4);
  tft.setCursor(10, 68);
  tft.print("Paired");

  // Line 2: desk name (the one you typed in the pair form). Provides clear
  // visual proof that the correct account claimed this hardware.
  tft.setTextColor(pal.title, pal.bg);
  tft.setTextFont(4);
  tft.setCursor(10, 100);
  if (deskName.length()) {
    tft.print(deskName);
  } else {
    tft.print("This desk");
  }

  tft.setTextColor(pal.subtle, pal.bg);
  tft.setTextFont(2);
  tft.setCursor(10, 138);
  String sub;
  if (deskLocation.length()) {
    sub += deskLocation;
  }
  if (ownerName.length()) {
    if (sub.length()) sub += "  -  ";
    sub += "on ";
    sub += ownerName;
    sub += "'s account";
  }
  if (sub.length() == 0) {
    sub = "Waiting for notes from your partner...";
  }
  tft.print(sub);
}

// Render body text wrapped to the screen width using font 4. Font 4 is
// variable-pitch but averages ~10 px per char, so ~30 chars per line on a
// 320-px screen works well. Note bodies are bounded at 140 chars by the
// server, which fits in ~5 lines.
void drawMessage(const String& body) {
  drawChromeHeader();
  ThemePalette pal = paletteForDesk();
  clearBody();

  const String printable = printableNoteBody(body);

  tft.setTextColor(pal.accent, pal.bg);
  tft.setTextFont(2);
  tft.setCursor(10, 64);
  tft.print("New note");

  tft.setTextColor(pal.body, pal.bg);
  tft.setTextFont(4);

  const int16_t  xStart      = 10;
  const int16_t  xMax        = tft.width() - 10;
  const uint16_t lineHeight  = 28;
  int16_t        y           = 88;

  String word;
  String line;

  auto flushLine = [&]() {
    if (line.length() == 0) return;
    tft.setCursor(xStart, y);
    tft.print(line);
    y += lineHeight;
    line = "";
  };

  auto pushWord = [&](const String& w) {
    if (w.length() == 0) return;
    const String probe = line.length() ? line + " " + w : w;
    if (tft.textWidth(probe) > (xMax - xStart)) {
      flushLine();
      line = w;
    } else {
      line = probe;
    }
  };

  for (size_t i = 0; i <= printable.length(); ++i) {
    const char c = i < printable.length() ? printable[i] : '\0';
    if (c == '\n' || c == '\0' || c == ' ' || c == '\t') {
      pushWord(word);
      word = "";
      if (c == '\n') flushLine();
      if (c == '\0') break;
    } else {
      word += c;
    }
    if (y > 200) break;
  }
  flushLine();
}

void drawErrorBox(const String& line1, const String& line2) {
  drawChromeHeader();
  ThemePalette pal = paletteForDesk();
  clearBody();

  tft.setTextColor(TFT_RED, pal.bg);
  tft.setTextFont(4);
  tft.setCursor(10, 70);
  tft.print("Problem");

  const size_t maxChars = 50;
  int16_t y = 108;
  auto drawWrapped = [&](const String& line) {
    tft.setTextColor(pal.body, pal.bg);
    tft.setTextFont(2);
    size_t i = 0;
    while (i < line.length() && y < 205) {
      tft.setCursor(10, y);
      tft.print(line.substring(i, i + maxChars));
      i += maxChars;
      y += 18;
    }
  };
  drawWrapped(line1);
  drawWrapped(line2);
}

// ---------------------------------------------------------------------------
// Wi-Fi — compile-time defaults, or NVS namespace "deskwifi" (ssid / pass)
// written over USB serial JSON: {"ssid":"...","pass":"..."}  (see /devices/connect-wifi)
// ---------------------------------------------------------------------------
void trySerialWifiProvision() {
  if (Serial.available() == 0) return;
  String line = Serial.readStringUntil('\n');
  line.trim();
  if (line.length() < 8 || line[0] != '{') return;

  String ssid;
  String pass;
  if (!extractJsonString(line, "ssid", ssid) || !extractJsonString(line, "pass", pass)) {
    Serial.println(F("{\"ok\":false,\"error\":\"need_ssid_pass_json\"}"));
    return;
  }
  if (ssid.length() == 0) {
    Serial.println(F("{\"ok\":false,\"error\":\"empty_ssid\"}"));
    return;
  }

  prefs.begin("deskwifi", /*readOnly=*/false);
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.end();

  Serial.println(F("{\"ok\":true,\"reboot\":true}"));
  delay(400);
  ESP.restart();
}

bool connectWifi() {
  prefs.begin("deskwifi", /*readOnly=*/true);
  const String nvsSsid = prefs.getString("ssid", "");
  const String nvsPass = prefs.getString("pass", "");
  prefs.end();

  const char* useSsid =
      nvsSsid.length() ? nvsSsid.c_str() : WIFI_SSID;
  const char* usePass =
      nvsPass.length() ? nvsPass.c_str() : WIFI_PASSWORD;

  Serial.printf("Connecting to %s (NVS=%s)\n", useSsid,
                nvsSsid.length() ? "yes" : "compile-time");
  drawStatus("Connecting to Wi-Fi...");

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(useSsid, usePass);

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

  Serial.print(F("Wi-Fi OK. IP: "));
  Serial.println(WiFi.localIP());
  return true;
}

// ---------------------------------------------------------------------------
// POST /api/device/register
// ---------------------------------------------------------------------------
RegistrationResult registerWithServer() {
  RegistrationResult r{};

  if (String(kDeviceApiKey) == "REPLACE_WITH_DEVICE_API_KEY") {
    r.errorDetail = "kDeviceApiKey not set";
    return r;
  }

  String url = kServerBaseUrl;
  url += "/api/device/register";

  Serial.printf("POST %s\n", url.c_str());
  drawStatus("Registering with server...");

  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  if (!beginHttp(http, url)) {
    r.errorDetail = "http.begin failed";
    return r;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", kDeviceApiKey);

  String body = "{\"firmware_version\":\"";
  body += kFirmwareVersion;
  body += "\"}";

  const int    status  = http.POST(body);
  const String payload = http.getString();
  http.end();

  r.httpStatus = status;
  Serial.printf("HTTP %d, body: %s\n", status, payload.c_str());

  if (status != 200) {
    String err;
    String detail;
    extractJsonString(payload, "error", err);
    extractJsonString(payload, "detail", detail);
    if (err.length() && detail.length()) {
      r.errorDetail = err + ": " + detail;
    } else if (err.length()) {
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
    r.errorDetail = "bad response (pairing_code missing)";
    return r;
  }
  extractJsonString(payload, "device_id", r.deviceId);
  extractJsonString(payload, "device_token", r.deviceToken);
  if (r.deviceId.length() == 0 || r.deviceToken.length() == 0) {
    r.errorDetail = "bad response (device_id / device_token missing)";
    return r;
  }

  r.ok = true;
  return r;
}

// ---------------------------------------------------------------------------
// GET /api/device/wait?deviceId=<id>
//
// Long-poll: this call blocks until the server has a note for us or its
// ~25 s timer fires. Either way we just loop and call again — no client-side
// polling cadence needed. Response shape matches /api/device/latest.
// ---------------------------------------------------------------------------
LatestResult fetchLatest() {
  LatestResult r{};

  String url = kServerBaseUrl;
  url += "/api/device/wait?deviceId=";
  url += creds.deviceId;

  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.setReuse(false);
  if (!beginHttp(http, url)) {
    return r;
  }

  String bearer = "Bearer ";
  bearer += creds.deviceToken;
  http.addHeader("Authorization", bearer);
  http.addHeader("X-Firmware-Version", kFirmwareVersion);

  const int    status  = http.GET();
  const String payload = http.getString();
  http.end();

  r.httpStatus = status;

  if (status != 200) {
    return r;
  }

  r.ok       = true;
  r.unpaired = jsonContainsKeyValue(payload, "reason", "unpaired");

  // Paired-state context. These only appear when the server has an owner
  // for this device. Our flat extractor picks them up correctly as long as
  // the keys are unique across the payload (they are in today's schema).
  extractJsonString(payload, "name", r.deskName);
  extractJsonString(payload, "location_name", r.deskLocation);
  extractJsonString(payload, "display_name", r.ownerName);
  extractJsonString(payload, "theme", r.themeId);
  extractJsonString(payload, "accent_color", r.accentId);

  String body;
  String id;
  if (extractJsonString(payload, "body", body) &&
      extractJsonString(payload, "id", id)) {
    r.hasMessage  = true;
    r.messageBody = body;
    r.messageId   = id;
  }
  return r;
}

// ---------------------------------------------------------------------------
// POST /api/device/seen
// ---------------------------------------------------------------------------
bool markSeen(const String& noteId) {
  String url = kServerBaseUrl;
  url += "/api/device/seen";

  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  if (!beginHttp(http, url)) return false;

  String bearer = "Bearer ";
  bearer += creds.deviceToken;
  http.addHeader("Authorization", bearer);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Id", creds.deviceId);
  http.addHeader("X-Firmware-Version", kFirmwareVersion);

  String body = "{\"note_id\":\"";
  body += noteId;
  body += "\"}";

  const int status = http.POST(body);
  http.end();

  Serial.printf("POST /seen (%s) -> HTTP %d\n", noteId.c_str(), status);
  return status == 200;
}

// ---------------------------------------------------------------------------
// State renderers
// ---------------------------------------------------------------------------
void enterUnpaired(const String& code) {
  if (displayState == DisplayState::Unpaired) return;
  drawPairingCode(code.length() ? code : String("------"));
  drawStatus("Type this code into DeskNote.", TFT_GREEN);
  displayState = DisplayState::Unpaired;
}

String lastPairedDeskName;
String lastPairedDeskLocation;
String lastPairedOwnerName;
String lastRenderedThemeId;
String lastRenderedAccentId;

void enterWaitingForNote(const String& deskName,
                         const String& deskLocation,
                         const String& ownerName) {
  const bool alreadyShowing =
      displayState == DisplayState::WaitingForNote &&
      deskName == lastPairedDeskName &&
      deskLocation == lastPairedDeskLocation &&
      ownerName == lastPairedOwnerName &&
      gThemeId == lastRenderedThemeId &&
      gAccentId == lastRenderedAccentId;
  if (alreadyShowing) return;
  drawWaitingForNote(deskName, deskLocation, ownerName);
  drawStatus("Paired and online.", TFT_GREEN);
  displayState            = DisplayState::WaitingForNote;
  lastPairedDeskName      = deskName;
  lastPairedDeskLocation  = deskLocation;
  lastPairedOwnerName     = ownerName;
  lastRenderedThemeId     = gThemeId;
  lastRenderedAccentId    = gAccentId;
}

void enterShowingMessage(const String& body) {
  drawMessage(body);
  drawStatus("Note received. Tap phone to send another.", TFT_GREEN);
  displayState = DisplayState::ShowingMessage;
}

void enterError(const String& line1, const String& line2) {
  drawErrorBox(line1, line2);
  drawStatus("Retrying...", TFT_RED);
  displayState = DisplayState::Error;
}

// ---------------------------------------------------------------------------
bool ensureRegistered() {
  if (hasCreds()) return true;

  const RegistrationResult reg = registerWithServer();
  if (!reg.ok) {
    Serial.printf("Registration failed: %s\n", reg.errorDetail.c_str());
    enterError("HTTP " + String(reg.httpStatus), reg.errorDetail);
    return false;
  }

  creds.deviceId    = reg.deviceId;
  creds.deviceToken = reg.deviceToken;
  saveCreds(creds);
  bootPairingCode = reg.pairingCode;

  Serial.printf("Registered. device_id=%s\n", creds.deviceId.c_str());
  Serial.printf("device_token (saved to NVS, shown once): %s\n",
                creds.deviceToken.c_str());
  Serial.printf("Pairing code: %s\n", bootPairingCode.c_str());
  return true;
}

// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println();
  Serial.println(F("=== DeskNote CYD hello ==="));
  Serial.printf("Chip: %s, cores: %d, firmware: %s\n",
                ESP.getChipModel(), ESP.getChipCores(), kFirmwareVersion);

  pinMode(PIN_BACKLIGHT, OUTPUT);
  digitalWrite(PIN_BACKLIGHT, HIGH);

  tft.init();
  tft.setRotation(1);

  drawChromeHeader();
  drawStatus("Booting...");

#if FORCE_REREGISTER
  Serial.println(F("FORCE_REREGISTER=1 — wiping saved credentials."));
  wipeCreds();
#else
  loadCreds();
  if (hasCreds()) {
    Serial.printf("Loaded creds from NVS. device_id=%s\n", creds.deviceId.c_str());
  } else {
    Serial.println(F("No creds in NVS — will register."));
  }
#endif

  if (!connectWifi()) {
    enterError("No Wi-Fi", "Check SSID / password and reboot.");
    return;
  }
  drawStatus("Wi-Fi OK.", TFT_GREEN);

  ensureRegistered();
}

// ---------------------------------------------------------------------------
// Poll loop
// ---------------------------------------------------------------------------
void pollOnce() {
  if (!hasCreds()) {
    ensureRegistered();
    return;
  }

  const LatestResult latest = fetchLatest();

  if (!latest.ok) {
    Serial.printf("GET /wait failed (HTTP %d)\n", latest.httpStatus);
    if (latest.httpStatus == 401) {
      Serial.println(F("Token rejected — wiping NVS and re-registering."));
      wipeCreds();
      ensureRegistered();
    } else {
      // Non-401: TLS error, timeout, 5xx, or Vercel cutting long-polls. Surface
      // it — otherwise the status line stays stuck on "Wi-Fi OK." forever.
      String detail = latest.httpStatus < 0
                        ? HTTPClient::errorToString(latest.httpStatus)
                        : ("HTTP " + String(latest.httpStatus));
      enterError("Server error", detail);
    }
    return;
  }

  if (latest.unpaired) {
    // Still showing the pairing_code from this boot's registration. If we
    // came up from NVS (no bootPairingCode) the desk was paired once and
    // has been unpaired server-side — clearest fix is to re-register so a
    // fresh code is issued and displayed.
    if (bootPairingCode.length() == 0) {
      Serial.println(F("Server says unpaired but we have no code — re-registering."));
      wipeCreds();
      ensureRegistered();
      return;
    }
    enterUnpaired(bootPairingCode);
    return;
  }

  // Paired from here on.
  bootPairingCode = "";

  if (latest.themeId.length()) gThemeId = latest.themeId;
  if (latest.accentId.length()) gAccentId = latest.accentId;

  if (latest.hasMessage) {
    if (latest.messageId != currentNoteId) {
      Serial.printf("New note %s: %s\n",
                    latest.messageId.c_str(), latest.messageBody.c_str());
      currentNoteId = latest.messageId;
      enterShowingMessage(latest.messageBody);
      markSeen(latest.messageId);
    }
    return;
  }

  // Paired, no queued note. Keep showing the last note if we have one so the
  // user can still read it; otherwise show the idle "paired" screen with
  // desk + owner context.
  if (displayState != DisplayState::ShowingMessage) {
    enterWaitingForNote(latest.deskName, latest.deskLocation, latest.ownerName);
  }
}

void loop() {
  trySerialWifiProvision();

  static uint32_t lastLog = 0;
  const uint32_t  now     = millis();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.printf("Wi-Fi dropped (status=%d). Retrying...\n", WiFi.status());
    connectWifi();
    delay(500);
    return;
  }

  if (now - lastLog > 30000) {
    lastLog = now;
    Serial.printf("RSSI: %d dBm, heap free: %u bytes, state: %d\n",
                  WiFi.RSSI(), (unsigned)ESP.getFreeHeap(), (int)displayState);
  }

  // One long-poll cycle per loop iteration. /api/device/wait blocks up to
  // ~25 s server-side, so this loop is naturally paced without sleeps.
  pollOnce();

  // Short guard delay after a successful cycle; longer back-off after errors
  // so we don't flood the server while it's 4xx/5xx-ing at us.
  if (displayState == DisplayState::Error) {
    delay(ERROR_BACKOFF_MS);
  } else {
    delay(IDLE_GUARD_MS);
  }
}
