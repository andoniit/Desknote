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
#include <string.h>
#include <vector>

// Used by tokenizeNoteBodyItems / drawMessageScreen. Must appear before any function
// definitions so Arduino's auto-generated prototypes (after #includes) never
// reference std::vector<NoteBodyItem> before this type exists.
struct NoteBodyItem {
  bool    isBreak;
  bool    isEmoji;
  String  text;
  uint8_t spriteUid;
};

// ---------------------------------------------------------------------------
// Wi-Fi credentials — replace the two placeholders.
// ---------------------------------------------------------------------------
const char* WIFI_SSID     = "DEEPAANI";
const char* WIFI_PASSWORD = "DEEPAANI123";

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
const char* kServerBaseUrl   = "https://www.desknote.space";
const char* kDeviceApiKey    = "5c27a1577e9b48d618f4653957e00996efee71c3752afa4d";
const char* kFirmwareVersion = "hello-2.1";

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
// Arduino IDE's auto-generated function prototypes — inserted before the
// first function in the sketch — don't reference undeclared types. This block
// MUST stay above the first function definition in the file.
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
  // Newest note body for this recipient (any status); for idle hero when queue empty.
  String lastMessageBody;
  /// From `messages.message_type` when a queued note is returned (e.g. `quick_send`).
  String messageType;
};

// Desk theme + accent from the web app (matches lib/devices/themes + accents).
// TFT is 16-bit; these are rough approximations of the app's palette.
// Declared with LatestResult so auto-generated prototypes see ThemePalette.
String gThemeId  = "cream";
String gAccentId = "";

struct ThemePalette {
  uint16_t bg;
  uint16_t headerBar;
  uint16_t accent;
  uint16_t title;
  uint16_t body;
  uint16_t subtle;
};

// First-boot-only: the pairing code we just got back from /register. We
// display this while the desk is still unpaired. Lost on reboot by design —
// once the desk is paired the server returns `unpaired: false` so we don't
// need it anymore.
String bootPairingCode;

// Track the note we're currently rendering so we only redraw on change.
String currentNoteId;

/// Absolute millis deadline; quick-send line shows only while millis() < this.
uint32_t gLittleTapUntilMs = 0;
static constexpr uint32_t kLittleTapVisibleMs = 2UL * 60UL * 1000UL;

/// Last "Write a message" (standard) body — kept on device so quick_send can sit below it.
String gPersistedMainMessage;

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

// Note bodies: UTF-8 emoji (incl. skin tones / VS16) match kEmoji; Twemoji-based
// RGB565 sprites in emoji_assets.gen.h render as color on the TFT next to text.
static void skipUtf8Vs16(const String& in, size_t& i) {
  if (i + 3 <= in.length()) {
    const uint8_t* p = (const uint8_t*)(in.c_str() + i);
    if (p[0] == 0xEF && p[1] == 0xB8 && p[2] == 0x8F) i += 3;
  }
}

static void skipSkinToneModifier(const String& in, size_t& i) {
  if (i + 4 <= in.length()) {
    const uint8_t* p = (const uint8_t*)(in.c_str() + i);
    if (p[0] == 0xF0 && p[1] == 0x9F && p[2] == 0x8F && p[3] >= 0xBB && p[3] <= 0xBF) {
      i += 4;
    }
  }
}

struct EmojiUtf8 {
  uint8_t        len;
  uint8_t        b[4];
  const char*    rep;
};

// 3- and 4-byte UTF-8 sequences (order: check 4-byte before generic UTF-8).
static const EmojiUtf8 kEmoji[] = {
    {3, {0xE2, 0x9D, 0xA4, 0}, "<3"},   // heart (U+2764)
    {3, {0xE2, 0x9C, 0xA8, 0}, "*"},     // sparkles
    {3, {0xE2, 0x98, 0xBA, 0}, ":)"},   // U+263A white smiley
    {3, {0xE2, 0x98, 0xB9, 0}, ":("},   // U+2639
    {3, {0xE2, 0x9C, 0x85, 0}, "[v]"},  // U+2705 check
    {3, {0xE2, 0x9D, 0x8C, 0}, "[x]"},  // U+274C cross mark
    {3, {0xE2, 0xAD, 0x90, 0}, "*"},    // U+2B50 star
    {3, {0xE2, 0x9D, 0xA3, 0}, "<3"},   // U+2763 heart decoration
    {3, {0xE2, 0x80, 0x94, 0}, "-"},    // em dash
    {4, {0xF0, 0x9F, 0x98, 0x80}, ":D"}, // grin
    {4, {0xF0, 0x9F, 0x98, 0x81}, ":D"},
    {4, {0xF0, 0x9F, 0x98, 0x82}, "lol"},
    {4, {0xF0, 0x9F, 0x98, 0x83}, ":D"},
    {4, {0xF0, 0x9F, 0x98, 0x84}, ":D"},
    {4, {0xF0, 0x9F, 0x98, 0x85}, ":s"},
    {4, {0xF0, 0x9F, 0x98, 0x86}, "xD"},
    {4, {0xF0, 0x9F, 0x98, 0x87}, ":P"},
    {4, {0xF0, 0x9F, 0x98, 0x88}, ";)"},
    {4, {0xF0, 0x9F, 0x98, 0x89}, ";)"},
    {4, {0xF0, 0x9F, 0x98, 0x8A}, ":)"},
    {4, {0xF0, 0x9F, 0x98, 0x8B}, ":P"},
    {4, {0xF0, 0x9F, 0x98, 0x8C}, ":)"},
    {4, {0xF0, 0x9F, 0x98, 0x8D}, "<3"},
    {4, {0xF0, 0x9F, 0x98, 0x8E}, ":P"},
    {4, {0xF0, 0x9F, 0x98, 0x8F}, ":|"},
    {4, {0xF0, 0x9F, 0x98, 0x90}, ":|"},
    {4, {0xF0, 0x9F, 0x98, 0x91}, ":|"},
    {4, {0xF0, 0x9F, 0x98, 0x92}, ":("},
    {4, {0xF0, 0x9F, 0x98, 0x93}, ":("},
    {4, {0xF0, 0x9F, 0x98, 0x94}, ":("},
    {4, {0xF0, 0x9F, 0x98, 0x95}, ":("},
    {4, {0xF0, 0x9F, 0x98, 0x96}, ":("},
    {4, {0xF0, 0x9F, 0x98, 0x97}, ":*"},
    {4, {0xF0, 0x9F, 0x98, 0x98}, ":*"},
    {4, {0xF0, 0x9F, 0x98, 0x99}, ":*"},
    {4, {0xF0, 0x9F, 0x98, 0x9A}, ":*"},
    {4, {0xF0, 0x9F, 0x98, 0x9B}, ":P"},
    {4, {0xF0, 0x9F, 0x98, 0x9C}, ":P"},
    {4, {0xF0, 0x9F, 0x98, 0x9D}, ":P"},
    {4, {0xF0, 0x9F, 0x98, 0x9E}, ":P"},
    {4, {0xF0, 0x9F, 0x98, 0x9F}, ":("},
    {4, {0xF0, 0x9F, 0x98, 0xA0}, ":("},
    {4, {0xF0, 0x9F, 0x98, 0xA1}, ":("},
    {4, {0xF0, 0x9F, 0x98, 0xA2}, ":("},
    {4, {0xF0, 0x9F, 0x98, 0xA3}, ":("},
    {4, {0xF0, 0x9F, 0x98, 0xA4}, ":("},
    {4, {0xF0, 0x9F, 0x98, 0xA5}, ":("},
    {4, {0xF0, 0x9F, 0x98, 0xA6}, ":("},
    {4, {0xF0, 0x9F, 0x98, 0xA7}, ":("},
    {4, {0xF0, 0x9F, 0x98, 0xA8}, ":("},
    {4, {0xF0, 0x9F, 0x98, 0xA9}, ":("},
    {4, {0xF0, 0x9F, 0x98, 0xAA}, "zzz"},
    {4, {0xF0, 0x9F, 0x98, 0xAB}, ":("},
    {4, {0xF0, 0x9F, 0x98, 0xAC}, ":P"},
    {4, {0xF0, 0x9F, 0x98, 0xAD}, ":'("},
    {4, {0xF0, 0x9F, 0x98, 0xAE}, ":o"},
    {4, {0xF0, 0x9F, 0x98, 0xAF}, ":o"},
    {4, {0xF0, 0x9F, 0x98, 0xB0}, ":o"},
    {4, {0xF0, 0x9F, 0x98, 0xB1}, ":("},
    {4, {0xF0, 0x9F, 0x98, 0xB2}, ":("},
    {4, {0xF0, 0x9F, 0x98, 0xB3}, ":("},
    {4, {0xF0, 0x9F, 0x98, 0xB4}, "zzz"},
    {4, {0xF0, 0x9F, 0x98, 0xB5}, ":("},
    {4, {0xF0, 0x9F, 0x98, 0xB6}, ":|"},
    {4, {0xF0, 0x9F, 0x98, 0xB7}, ":("},
    {4, {0xF0, 0x9F, 0x98, 0xB8}, ":("},
    {4, {0xF0, 0x9F, 0x98, 0xB9}, ":("},
    {4, {0xF0, 0x9F, 0x98, 0xBA}, ":("},
    {4, {0xF0, 0x9F, 0x98, 0xBB}, ":("},
    {4, {0xF0, 0x9F, 0x98, 0xBC}, ":("},
    {4, {0xF0, 0x9F, 0x98, 0xBD}, ":("},
    {4, {0xF0, 0x9F, 0x98, 0xBE}, ":("},
    {4, {0xF0, 0x9F, 0x98, 0xBF}, ":("},
    {4, {0xF0, 0x9F, 0x99, 0x82}, ":)"},
    {4, {0xF0, 0x9F, 0x99, 0x83}, ":)"},
    {4, {0xF0, 0x9F, 0x99, 0x84}, "roll"},
    {4, {0xF0, 0x9F, 0x99, 0x85}, ":)"},
    {4, {0xF0, 0x9F, 0x99, 0x86}, ":)"},
    {4, {0xF0, 0x9F, 0x99, 0x87}, ":)"},
    {4, {0xF0, 0x9F, 0x99, 0x88}, ":)"},
    {4, {0xF0, 0x9F, 0x99, 0x89}, ":)"},
    {4, {0xF0, 0x9F, 0x99, 0x8A}, ":)"},
    {4, {0xF0, 0x9F, 0x99, 0x8B}, ":)"},
    {4, {0xF0, 0x9F, 0x99, 0x8C}, ":)"},
    {4, {0xF0, 0x9F, 0x99, 0x8D}, ":)"},
    {4, {0xF0, 0x9F, 0x99, 0x8E}, ":)"},
    {4, {0xF0, 0x9F, 0x99, 0x8F}, "pray"},
    {4, {0xF0, 0x9F, 0x91, 0x8D}, "+1"},
    {4, {0xF0, 0x9F, 0x91, 0x8E}, "-1"},
    {4, {0xF0, 0x9F, 0x91, 0x8F}, "clap"},
    {4, {0xF0, 0x9F, 0x91, 0x8B}, "wave"},
    {4, {0xF0, 0x9F, 0x91, 0x8C}, "ok"},
    {4, {0xF0, 0x9F, 0x92, 0x80}, "skull"},
    {4, {0xF0, 0x9F, 0x92, 0x95}, "<3"},
    {4, {0xF0, 0x9F, 0x92, 0x96}, "<3"},
    {4, {0xF0, 0x9F, 0x92, 0x97}, "<3"},
    {4, {0xF0, 0x9F, 0x92, 0x98}, "<3"},
    {4, {0xF0, 0x9F, 0x92, 0x99}, "<3"},
    {4, {0xF0, 0x9F, 0x92, 0x9A}, "<3"},
    {4, {0xF0, 0x9F, 0x92, 0x9B}, "<3"},
    {4, {0xF0, 0x9F, 0x92, 0x9C}, "<3"},
    {4, {0xF0, 0x9F, 0x92, 0x9D}, "<3"},
    {4, {0xF0, 0x9F, 0x92, 0x9E}, "<3"},
    {4, {0xF0, 0x9F, 0x92, 0x9F}, "<3"},
    {4, {0xF0, 0x9F, 0x92, 0xA0}, "<3"},
    {4, {0xF0, 0x9F, 0x92, 0xA1}, "<3"},
    {4, {0xF0, 0x9F, 0x92, 0xA2}, "<3"},
    {4, {0xF0, 0x9F, 0x92, 0xA3}, "<3"},
    {4, {0xF0, 0x9F, 0x92, 0xA4}, "zzz"},
    {4, {0xF0, 0x9F, 0x92, 0xA5}, "<3"},
    {4, {0xF0, 0x9F, 0x92, 0xA8}, "100"},
    {4, {0xF0, 0x9F, 0x92, 0xA9}, "P"},
    {4, {0xF0, 0x9F, 0x92, 0xAA}, "muscle"},
    {4, {0xF0, 0x9F, 0x92, 0xAB}, "balloon"},
    {4, {0xF0, 0x9F, 0x92, 0xAC}, "mail"},
    {4, {0xF0, 0x9F, 0x92, 0xAF}, "100"},
    {4, {0xF0, 0x9F, 0x93, 0xB7}, "cam"},
    {4, {0xF0, 0x9F, 0x94, 0xA5}, "fire"},
    {4, {0xF0, 0x9F, 0x94, 0xA4}, "book"},
    {4, {0xF0, 0x9F, 0x91, 0xBB}, "ghost"},
    {4, {0xF0, 0x9F, 0x95, 0xBA}, "dance"},
    {4, {0xF0, 0x9F, 0x8E, 0x89}, "party"},
    {4, {0xF0, 0x9F, 0x8E, 0x8A}, "party"},
    {4, {0xF0, 0x9F, 0x8E, 0x81}, "cake"},
    {4, {0xF0, 0x9F, 0x8D, 0x95}, "pizza"},
    {4, {0xF0, 0x9F, 0x8D, 0xBA}, "beer"},
    {4, {0xF0, 0x9F, 0x8D, 0xB5}, "coffee"},
    {4, {0xF0, 0x9F, 0x8C, 0x99}, "moon"},
    {4, {0xF0, 0x9F, 0x8C, 0x9E}, "sun"},
    {4, {0xF0, 0x9F, 0x8C, 0x8E}, "earth"},
    {4, {0xF0, 0x9F, 0x90, 0xB6}, "dog"},
    {4, {0xF0, 0x9F, 0x90, 0xB1}, "cat"},
    {4, {0xF0, 0x9F, 0xA4, 0xA3}, "lol"},
    {4, {0xF0, 0x9F, 0xA4, 0x94}, "hmm"},
    {4, {0xF0, 0x9F, 0xA4, 0xAF}, "boom"},
    {4, {0xF0, 0x9F, 0xA4, 0x8D}, "<3"}, // white heart
    {4, {0xF0, 0x9F, 0xA4, 0x8E}, "<3"}, // brown heart
    {4, {0xF0, 0x9F, 0x96, 0xA4}, "<3"}, // black heart
    {4, {0xF0, 0x9F, 0xAB, 0xB6}, "<3"}, // heart hands
    {4, {0xF0, 0x9F, 0x91, 0x80}, "eyes"}, // U+1F440 EYES
    {4, {0xF0, 0x9F, 0x91, 0x81}, "eyes"}, // U+1F441 EYE
    {4, {0xF0, 0x9F, 0x91, 0x89}, "->"},
    {4, {0xF0, 0x9F, 0x91, 0x88}, "<-"},
    {4, {0xF0, 0x9F, 0x99, 0x8C}, "yay"},
    {3, {0xE2, 0x9C, 0x8C, 0}, "V"},     // victory hand
    {3, {0xE2, 0x99, 0xA5, 0}, "<3"},    // heart suit
    {4, {0xF0, 0x9F, 0xA5, 0xB0}, "<3"},
    {4, {0xF0, 0x9F, 0xA5, 0xB3}, "party"},
    {4, {0xF0, 0x9F, 0xA5, 0xB2}, "tear"},
};

#include "emoji_assets.gen.h"
static_assert(sizeof(kEmoji) / sizeof(kEmoji[0]) == EMOJI_TABLE_ROWS,
              "kEmoji rows out of sync — run scripts/gen_emoji_assets.py");

// Walk UTF-8 note body: ASCII words, explicit line breaks, Twemoji sprites (see
// emoji_assets.gen.h). Unknown UTF-8 becomes '*' in the text stream.
static void tokenizeNoteBodyItems(const String& in, std::vector<NoteBodyItem>& out) {
  out.clear();
  String word;

  auto flushWord = [&]() {
    if (word.length() == 0) return;
    out.push_back({false, false, word, 0});
    word = "";
  };
  auto flushBreak = [&]() {
    flushWord();
    out.push_back({true, false, "", 0});
  };

  for (size_t i = 0; i < in.length();) {
    if (i + 2 < in.length()) {
      const uint8_t* p = (const uint8_t*)(in.c_str() + i);
      if (p[0] == 0xE2 && p[1] == 0x80 && p[2] == 0x8D) {
        i += 3;
        continue;
      }
    }

    const uint8_t b0 = (uint8_t)in[i];
    if (b0 < 0x80) {
      const char c = (char)b0;
      if (c == '\n') {
        flushBreak();
      } else if (c == ' ' || c == '\t') {
        flushWord();
      } else {
        word += c;
      }
      i += 1;
      continue;
    }

    bool matched = false;
    for (size_t k = 0; k < sizeof(kEmoji) / sizeof(kEmoji[0]); ++k) {
      const EmojiUtf8& e = kEmoji[k];
      if (i + e.len > in.length()) continue;
      if (memcmp(in.c_str() + i, e.b, e.len) == 0) {
        flushWord();
        out.push_back({false, true, "", kEmojiRowSpriteIdx[k]});
        i += e.len;
        skipUtf8Vs16(in, i);
        if (e.len == 4) skipSkinToneModifier(in, i);
        matched = true;
        break;
      }
    }
    if (matched) continue;

    size_t skip = 1;
    if ((b0 & 0xE0) == 0xC0 && i + 1 < in.length())
      skip = 2;
    else if ((b0 & 0xF0) == 0xE0 && i + 2 < in.length())
      skip = 3;
    else if ((b0 & 0xF8) == 0xF0 && i + 3 < in.length())
      skip = 4;
    word += '*';
    i += skip;
  }
  flushWord();
}

// ---------------------------------------------------------------------------
// Drawing helpers — GLCD font (1) + integer scale = chunky bitmap / “pixel” UI.
// Pairing code keeps font 7 (segment digits). See LOAD_GLCD in User_Setup.h.
// ---------------------------------------------------------------------------
static constexpr uint8_t kDeskFontScaleXL   = 3;
static constexpr uint8_t kDeskFontScaleBody = 2;
static constexpr uint8_t kDeskFontScaleNote = 3;

static inline void deskFontChromeTitle() {
  tft.setTextFont(1);
  tft.setTextSize(kDeskFontScaleXL);
}
static inline void deskFontChromeMeta() {
  tft.setTextFont(1);
  tft.setTextSize(kDeskFontScaleBody);
}
static inline void deskFontBody() {
  tft.setTextFont(1);
  tft.setTextSize(kDeskFontScaleBody);
}
static inline void deskFontNote() {
  tft.setTextFont(1);
  tft.setTextSize(kDeskFontScaleNote);
}
static inline void deskFontLittleTap() {
  tft.setTextFont(1);
  tft.setTextSize(1);
}
static inline void deskFontPairingDigits() {
  tft.setTextFont(7);
  tft.setTextSize(1);
}

// Draw a Twemoji sprite with 0x0000 treated as transparent so the sprite's
// outer padding doesn't paint a black halo over the beige note card. Callers
// only ever need scale=1 today; the parameter is left in case a future screen
// wants a pixel-doubled hero emoji.
static void drawEmojiSprite(int16_t x, int16_t y, uint8_t spriteUid, uint8_t scale = 1) {
  if (spriteUid >= EMOJI_UNIQUE_SPRITES) return;
  const uint16_t* data = kEmojiSpriteData[spriteUid];
  if (scale <= 1) {
    tft.pushImage(x, y, EMOJI_SPRITE_PX, EMOJI_SPRITE_PX,
                  const_cast<uint16_t*>(data), 0x0000);
    return;
  }
  for (int py = 0; py < EMOJI_SPRITE_PX; ++py) {
    for (int px = 0; px < EMOJI_SPRITE_PX; ++px) {
      const uint16_t c = data[py * EMOJI_SPRITE_PX + px];
      if (c == 0x0000) continue;
      tft.fillRect(x + px * scale, y + py * scale, scale, scale, c);
    }
  }
}

static int16_t measureNoteItemWidth(const NoteBodyItem& it) {
  if (it.isEmoji) return (int16_t)(EMOJI_SPRITE_PX + 4);
  deskFontNote();
  return tft.textWidth(it.text.c_str());
}

static void collectWrappedNoteRows(const std::vector<NoteBodyItem>& items,
                                   int16_t                      xMargin,
                                   std::vector<std::vector<NoteBodyItem>>& rowsOut) {
  rowsOut.clear();
  std::vector<NoteBodyItem> row;
  deskFontNote();
  const int16_t spaceW = tft.textWidth(" ");
  const int16_t innerW = tft.width() - 2 * xMargin;

  for (size_t i = 0; i < items.size(); ++i) {
    const NoteBodyItem& it = items[i];
    if (it.isBreak) {
      if (!row.empty()) {
        rowsOut.push_back(row);
        row.clear();
      }
      continue;
    }
    std::vector<NoteBodyItem> trial = row;
    trial.push_back(it);
    int32_t w = 0;
    for (size_t j = 0; j < trial.size(); ++j) {
      if (j > 0) w += spaceW;
      w += measureNoteItemWidth(trial[j]);
    }
    if (w <= (int32_t)innerW || row.empty()) {
      row = trial;
    } else {
      if (!row.empty()) rowsOut.push_back(row);
      row.clear();
      row.push_back(it);
    }
  }
  if (!row.empty()) rowsOut.push_back(row);
}

void drawChromeHeader() {
  ThemePalette pal = paletteForDesk();
  tft.fillScreen(pal.bg);
  tft.fillRoundRect(0, 0, tft.width(), 52, 10, pal.headerBar);

  tft.setTextColor(pal.title, pal.headerBar);
  deskFontChromeTitle();
  tft.setCursor(12, 8);
  tft.print("DeskNote");

  tft.setTextColor(pal.subtle, pal.headerBar);
  deskFontChromeMeta();
  tft.setCursor(12, 34);
  tft.print("For two");

  // Firmware build — matches kFirmwareVersion; server syncs via X-Firmware-Version.
  const String ver = kFirmwareVersion;
  deskFontChromeMeta();
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
  deskFontChromeMeta();
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
  deskFontBody();
  tft.setCursor(10, 70);
  tft.print("Pairing code");

  // Font 7 is the built-in 7-segment style font; digits-only. Our pairing
  // codes are 6 decimal digits, which matches.
  tft.setTextColor(pal.title, pal.bg);
  deskFontPairingDigits();
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
  deskFontBody();
  tft.setCursor(10, 68);
  tft.print("Paired");

  // Line 2: desk name (the one you typed in the pair form). Provides clear
  // visual proof that the correct account claimed this hardware.
  tft.setTextColor(pal.title, pal.bg);
  deskFontBody();
  tft.setCursor(10, 100);
  if (deskName.length()) {
    tft.print(deskName);
  } else {
    tft.print("This desk");
  }

  tft.setTextColor(pal.subtle, pal.bg);
  deskFontChromeMeta();
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

// Full-screen centered note (pixel GLCD + Twemoji). Outer frame is black; an inset
// rounded panel is #F5F5DC (beige); body text #C4A484. Long (standard) message is
// centered in the beige area; quick_send line is separate, below the main text,
// for `kLittleTapVisibleMs`. Footer on black: DeskNote-{desk name} when showFooter.
//
// typingDelayMs > 0 makes text + emoji reveal progressively (like a typewriter).
// The card, hearts, and positioning are still painted in one go first, so we
// only inch through the body; the screen doesn't flicker between characters.
// Pass 0 for any "redraw to update state" path (footer hide, tap timeout) so
// those feel instantaneous.
void drawMessageScreen(const String& mainBody, const String& deskName, bool showFooter,
                       const String& messageType, const String& tapBody,
                       uint8_t typingDelayMs = 0) {
  // #F5F5DC / #C4A484 — fixed RGB565 (not theme-driven).
  constexpr uint16_t kNoteBeige = 0xF7BB;
  constexpr uint16_t kNoteFg    = 0xC530;
  constexpr int16_t  kFrame     = 8;
  constexpr int16_t  kPanelPad  = 10;

  tft.fillScreen(TFT_BLACK);

  deskFontChromeMeta();
  const int16_t footerLineH = (int16_t)(8 * kDeskFontScaleBody + 4);
  const int16_t footerY =
      showFooter ? (int16_t)(tft.height() - 10 - footerLineH) : (int16_t)(tft.height());
  // Beige layer stops above the footer strip so the label reads on black.
  const int16_t beigeBottom =
      showFooter ? (int16_t)(footerY - 8) : (int16_t)(tft.height() - kFrame);
  const int16_t beigeH = (int16_t)(beigeBottom - kFrame);
  if (beigeH > 28) {
    tft.fillRoundRect(kFrame, kFrame, (int16_t)(tft.width() - 2 * kFrame), beigeH, 12,
                      kNoteBeige);
  }

  const int16_t xMargin = (int16_t)(kFrame + kPanelPad);
  std::vector<NoteBodyItem> items;
  tokenizeNoteBodyItems(mainBody, items);

  std::vector<std::vector<NoteBodyItem>> rows;
  collectWrappedNoteRows(items, xMargin, rows);

  deskFontNote();
  const int16_t spaceW = tft.textWidth(" ");
  const uint16_t lhText = (uint16_t)(8 * kDeskFontScaleNote + 8);
  const uint16_t lhEmoji = (uint16_t)(EMOJI_SPRITE_PX + 6);
  const uint16_t lineHeight = lhText > lhEmoji ? lhText : lhEmoji;

  constexpr size_t kMaxNoteRows = 10;
  while (rows.size() > kMaxNoteRows) rows.pop_back();

  const int16_t contentBottom = (int16_t)(beigeBottom - kPanelPad);
  const int16_t contentTop    = (int16_t)(kFrame + kPanelPad);
  const int32_t totalMsgH    = (int32_t)rows.size() * (int32_t)lineHeight;
  const int32_t availH       = (int32_t)contentBottom - (int32_t)contentTop;
  int16_t       y0           = (int16_t)(contentTop + (availH - totalMsgH) / 2);
  if (y0 < contentTop) y0 = contentTop;

  const bool showTap = (messageType == "quick_send" && tapBody.length() > 0 &&
                        gLittleTapUntilMs != 0 && millis() < gLittleTapUntilMs);
  constexpr int16_t kTapGap = 8;

  for (size_t r = 0; r < rows.size(); ++r) {
    int32_t rw = 0;
    for (size_t j = 0; j < rows[r].size(); ++j) {
      if (j > 0) rw += spaceW;
      rw += measureNoteItemWidth(rows[r][j]);
    }
    int16_t x = (int16_t)((tft.width() - rw) / 2);
    int16_t y = (int16_t)(y0 + (int32_t)r * (int32_t)lineHeight);

    tft.setTextColor(kNoteFg, kNoteBeige);
    for (size_t i = 0; i < rows[r].size(); ++i) {
      const NoteBodyItem& it = rows[r][i];
      if (it.isEmoji) {
        const int16_t ey =
            y + (int16_t)((lineHeight - (uint16_t)EMOJI_SPRITE_PX) / 2);
        drawEmojiSprite(x, ey, it.spriteUid);
        x += (int16_t)(EMOJI_SPRITE_PX + 4);
        // Emojis land with a slightly longer beat than individual characters —
        // feels like the sender paused to drop in a reaction.
        if (typingDelayMs) delay((uint32_t)typingDelayMs * 2);
      } else {
        deskFontNote();
        for (size_t c = 0; c < it.text.length(); ++c) {
          const char ch = it.text[c];
          tft.setCursor(x, y);
          tft.print(ch);
          char buf[2] = {ch, 0};
          x += tft.textWidth(buf);
          if (typingDelayMs) delay(typingDelayMs);
        }
      }
      if (i + 1 < rows[r].size()) x += spaceW;
    }
  }

  if (showTap) {
    deskFontLittleTap();
    tft.setTextColor(kNoteFg, kNoteBeige);
    const int16_t tapY = (int16_t)(y0 + totalMsgH + kTapGap);
    const int16_t tapW = tft.textWidth(tapBody.c_str());
    int16_t tapX;
    if (tapY + 14 < beigeBottom && tapW <= tft.width() - 2 * xMargin) {
      tapX = (int16_t)((tft.width() - tapW) / 2);
    } else if (tapY + 14 < beigeBottom) {
      tapX = xMargin;  // long preset — clip from the left margin
    } else {
      tapX = -1;  // doesn't fit on screen at all
    }
    if (tapX >= 0) {
      int16_t tx = tapX;
      for (size_t c = 0; c < tapBody.length(); ++c) {
        const char ch = tapBody[c];
        tft.setCursor(tx, tapY);
        tft.print(ch);
        char buf[2] = {ch, 0};
        tx += tft.textWidth(buf);
        if (typingDelayMs) delay(typingDelayMs);
      }
    }
  }

  if (showFooter) {
    deskFontChromeMeta();
    int16_t x = xMargin;
    tft.setTextColor(kNoteFg, TFT_BLACK);
    tft.setCursor(x, footerY);
    tft.print("DeskNote-");
    tft.print(deskName.length() ? deskName.c_str() : "Desk");
  }
}

// Progressive "typewriter" reveal. The background card, corner framing, and
// footer are painted once up front by drawMessageScreen; the typingDelayMs
// then staggers each character/emoji onto the pre-painted card so nothing
// flickers. ~20 ms/char means a full 140-char note finishes inside ~3 s.
static constexpr uint8_t kTypingDelayMs = 20;
static void playTypingIntro(const String& mainPart, const String& tapPart,
                            const String& deskName, bool showFooter,
                            const String& messageType) {
  if (messageType == "quick_send" && tapPart.length() > 0) {
    gLittleTapUntilMs = millis() + kLittleTapVisibleMs;
  } else {
    gLittleTapUntilMs = 0;
  }
  drawMessageScreen(mainPart, deskName, showFooter, messageType, tapPart,
                    kTypingDelayMs);
}

void drawErrorBox(const String& line1, const String& line2) {
  drawChromeHeader();
  ThemePalette pal = paletteForDesk();
  clearBody();

  tft.setTextColor(TFT_RED, pal.bg);
  deskFontBody();
  tft.setCursor(10, 70);
  tft.print("Problem");

  const size_t maxChars = 50;
  int16_t y = 108;
  auto drawWrapped = [&](const String& line) {
    tft.setTextColor(pal.body, pal.bg);
    deskFontChromeMeta();
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
  extractJsonString(payload, "last_message_body", r.lastMessageBody);
  extractJsonString(payload, "message_type", r.messageType);

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
String lastRenderedIdleBody;

// Note screen: cache body for footer timeout redraw (centered layout).
String       gCachedNoteBody;
String       gCachedMainBody;
String       gCachedTapBody;
String       gCachedMessageType;
uint32_t     gNoteShownAtMs        = 0;
bool         gMessageFooterHidden  = false;
static constexpr uint32_t kMessageFooterVisibleMs = 10UL * 60UL * 1000UL;

void enterWaitingForNote(const String& deskName,
                         const String& deskLocation,
                         const String& ownerName,
                         const String& lastMessageBody) {
  // Hero text: prefer the last long-form message we stored so a quick_send note
  // (newest in API) does not replace it on the idle screen.
  const String heroBody =
      (gPersistedMainMessage.length() > 0) ? gPersistedMainMessage : lastMessageBody;

  const bool alreadyShowing =
      displayState == DisplayState::WaitingForNote &&
      deskName == lastPairedDeskName &&
      deskLocation == lastPairedDeskLocation &&
      ownerName == lastPairedOwnerName &&
      gThemeId == lastRenderedThemeId &&
      gAccentId == lastRenderedAccentId &&
      heroBody == lastRenderedIdleBody;
  if (alreadyShowing) return;

  lastPairedDeskName     = deskName;
  lastPairedDeskLocation = deskLocation;
  lastPairedOwnerName    = ownerName;
  lastRenderedThemeId    = gThemeId;
  lastRenderedAccentId   = gAccentId;
  lastRenderedIdleBody   = heroBody;

  const bool skipIntroFromNote =
      displayState == DisplayState::ShowingMessage && lastMessageBody.length() > 0 &&
      lastMessageBody == gCachedNoteBody;

  if (heroBody.length() > 0) {
    if (skipIntroFromNote) {
      drawMessageScreen(heroBody, deskName, true, "", "");
    } else {
      playTypingIntro(heroBody, "", deskName, true, "");
    }
    gNoteShownAtMs       = millis();
    gMessageFooterHidden = false;
  } else {
    drawWaitingForNote(deskName, deskLocation, ownerName);
    drawStatus("Paired and online.", TFT_GREEN);
  }
  displayState = DisplayState::WaitingForNote;
}

void enterShowingMessage(const String& body, const String& messageType) {
  String mainPart;
  String tapPart;
  if (messageType == "quick_send" && gPersistedMainMessage.length() > 0) {
    mainPart = gPersistedMainMessage;
    tapPart  = body;
  } else {
    tapPart = "";
    if (messageType == "quick_send") {
      mainPart = body;
    } else {
      gPersistedMainMessage = body;
      mainPart              = body;
    }
  }

  gCachedNoteBody      = body;
  gCachedMainBody      = mainPart;
  gCachedTapBody       = tapPart;
  gCachedMessageType   = messageType;
  gMessageFooterHidden = false;
  playTypingIntro(mainPart, tapPart, lastPairedDeskName, true, messageType);
  gNoteShownAtMs = millis();
  displayState     = DisplayState::ShowingMessage;
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
  if (latest.deskName.length()) lastPairedDeskName = latest.deskName;
  if (latest.deskLocation.length()) lastPairedDeskLocation = latest.deskLocation;
  if (latest.ownerName.length()) lastPairedOwnerName = latest.ownerName;

  if (latest.hasMessage) {
    if (latest.messageId != currentNoteId) {
      Serial.printf("New note %s: %s\n",
                    latest.messageId.c_str(), latest.messageBody.c_str());
      currentNoteId = latest.messageId;
      enterShowingMessage(latest.messageBody, latest.messageType);
      markSeen(latest.messageId);
    }
    return;
  }

  // Paired, no queued note — idle hero (last_message_body from API) or legacy
  // "Paired" screen. Also runs after markSeen when leaving ShowingMessage.
  enterWaitingForNote(latest.deskName, latest.deskLocation, latest.ownerName,
                      latest.lastMessageBody);
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

  if (displayState == DisplayState::ShowingMessage &&
      gCachedMessageType == "quick_send" && gLittleTapUntilMs != 0 &&
      millis() >= gLittleTapUntilMs) {
    gLittleTapUntilMs = 0;
    drawMessageScreen(gCachedMainBody, lastPairedDeskName, !gMessageFooterHidden,
                      gCachedMessageType, gCachedTapBody);
  }

  if (!gMessageFooterHidden &&
      (millis() - gNoteShownAtMs) >= kMessageFooterVisibleMs) {
    if (displayState == DisplayState::ShowingMessage) {
      gMessageFooterHidden = true;
      drawMessageScreen(gCachedMainBody, lastPairedDeskName, false, gCachedMessageType,
                        gCachedTapBody);
    } else if (displayState == DisplayState::WaitingForNote &&
               lastRenderedIdleBody.length() > 0) {
      gMessageFooterHidden = true;
      drawMessageScreen(lastRenderedIdleBody, lastPairedDeskName, false, "", "");
    }
  }

  // Short guard delay after a successful cycle; longer back-off after errors
  // so we don't flood the server while it's 4xx/5xx-ing at us.
  if (displayState == DisplayState::Error) {
    delay(ERROR_BACKOFF_MS);
  } else {
    delay(IDLE_GUARD_MS);
  }
}
