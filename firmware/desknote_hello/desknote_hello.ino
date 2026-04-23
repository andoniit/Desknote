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
#include <SPI.h>
#include <TFT_eSPI.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <stdlib.h>
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
// CYD ships in two backlight wirings: the original "R1" board uses GPIO 21,
// the newer "R2" rev moved it to GPIO 27. Driving both pins HIGH at boot is
// a safe no-op for whichever pin isn't actually wired to the LED on a given
// unit, so the screen lights up either way.
static constexpr uint8_t  PIN_BACKLIGHT_R1        = 21;
static constexpr uint8_t  PIN_BACKLIGHT_R2        = 27;
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

// Server-reachable flag. Flipped to false on non-401 HTTP errors and back to
// true on the next successful /latest call. While false we keep the last
// rendered note on screen and paint a small "offline" strip along the bottom
// so the desk reads as "stale" rather than broken. Declared up here (above
// drawMessageScreen) so the renderer can consult it during its final footer
// pass without a forward declaration.
bool     gServerReachable = true;
uint32_t gLastServerOkMs  = 0;

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

// MDI Private-Use-Area glyphs (kiss / cry / poop). The web composer inserts
// these PUA codepoints directly via the emoji picker; the firmware matches
// the raw UTF-8 bytes here and renders the corresponding sprite.
static const EmojiUtf8 kEmoji[] = {
    {4, {0xF3, 0xB0, 0xB1, 0xB2}, "kiss"},    // U+F0C72  mdi:emoticon-kiss
    {4, {0xF3, 0xB0, 0xB1, 0xAD}, "cry"},     // U+F0C6D  mdi:emoticon-cry-outline
    {4, {0xF3, 0xB0, 0x87, 0xB7}, "poop"},    // U+F01F7  mdi:emoticon-poop
    {4, {0xF3, 0xB0, 0xB1, 0xB8}, "wink"},    // U+F0C78  mdi:emoticon-wink
    {4, {0xF3, 0xB0, 0x87, 0xB9}, "tongue"},  // U+F01F9  mdi:emoticon-tongue
    {4, {0xF3, 0xB0, 0xB1, 0xB4}, "neutral"}, // U+F0C74  mdi:emoticon-neutral
    {4, {0xF3, 0xB0, 0x8B, 0x92}, "heart"},   // U+F02D2  mdi:heart-box
    {4, {0xF3, 0xB0, 0xAF, 0xA3}, "you"},     // U+F0BE3  mdi:account-heart-outline
    {4, {0xF3, 0xB1, 0x83, 0xB1}, "hug"},     // U+F10F1  mdi:hand-heart
    {4, {0xF3, 0xB1, 0x88, 0x91}, "batt"},    // U+F1211  mdi:battery-heart-variant
    {4, {0xF3, 0xB0, 0x89, 0x8A}, "flower"},  // U+F024A  mdi:flower
    {4, {0xF3, 0xB1, 0xB1, 0xB3}, "tree"},    // U+F1C73  mdi:pine-tree-variant
    {4, {0xF3, 0xB0, 0x96, 0x92}, "rain"},    // U+F0592  mdi:weather-hail
    {4, {0xF3, 0xB0, 0x96, 0xA8}, "sun"},     // U+F05A8  mdi:white-balance-sunny
    {4, {0xF3, 0xB0, 0x96, 0x9A}, "dusk"},    // U+F059A  mdi:weather-sunset
    {4, {0xF3, 0xB0, 0xB4, 0x88}, "poppy"},   // U+F0D08  mdi:flower-poppy
    {4, {0xF3, 0xB0, 0xBE, 0xA1}, "bee"},    // U+F0FA1  mdi:bee
    {4, {0xF3, 0xB0, 0xA9, 0x83}, "dog"},    // U+F0A43  mdi:dog
    {4, {0xF3, 0xB0, 0x84, 0x9B}, "cat"},    // U+F011B  mdi:cat
    {4, {0xF3, 0xB0, 0x9F, 0x86}, "elephant"}, // U+F07C6  mdi:elephant
    {4, {0xF3, 0xB0, 0x87, 0x81}, "usd"},     // U+F01C1  mdi:currency-usd
    {4, {0xF3, 0xB0, 0x8F, 0x98}, "palette"}, // U+F03D8  mdi:palette
    {4, {0xF3, 0xB0, 0x9E, 0x85}, "sticker"}, // U+F0785  mdi:sticker-emoji
    {4, {0xF3, 0xB0, 0x86, 0x98}, "cookie"}, // U+F0198  mdi:cookie
    {4, {0xF3, 0xB0, 0xAE, 0xAD}, "1up"},    // U+F0BAD  mdi:one-up
    {4, {0xF3, 0xB0, 0xAF, 0x89}, "alien"},  // U+F0BC9  mdi:space-invaders
    {4, {0xF3, 0xB1, 0xA0, 0x98}, "bath"},   // U+F1818  mdi:bathtub
    {4, {0xF3, 0xB0, 0x8E, 0x87}, "music"},  // U+F0387  mdi:music-note
    {4, {0xF3, 0xB0, 0xA5, 0xB3}, "om"},     // U+F0973  mdi:om
    {4, {0xF3, 0xB0, 0x8B, 0x91}, "heartln"}, // U+F02D1  mdi:heart
    {4, {0xF3, 0xB0, 0xA8, 0x9C}, "film"},   // U+F0A1C  mdi:video-vintage
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

// MDI glyphs are now stored at their native display size (40×40) so the
// line-art detail (eyes, mouth, leaves, etc.) survives all the way to the
// screen. Keep scale=1 so each native pixel maps 1:1 to a screen pixel —
// upscaling by 2× turned the icons into undifferentiated blobs on the 2.8"
// panel. measureNoteItemWidth + lineHeight below pick the display size up
// from here, so a regen with a different SPRITE constant just works.
static constexpr uint8_t kEmojiNoteScale = 1;
static constexpr int16_t kEmojiNotePx    = (int16_t)EMOJI_SPRITE_PX * kEmojiNoteScale;

// TFT_eSPI has no public getStartCount(); track sketch-driven startWrite/endWrite
// nesting so touchReadPressed can bail while a batched TFT pass is active.
static uint8_t gTftSketchWriteDepth = 0;

// Draw an emoji sprite, tinting every opaque pixel to `tintColor`. MDI glyphs
// are monochrome line-art; storing their silhouette lets the firmware repaint
// them in the current theme's body-text color (so they always match the
// surrounding text) and upscale them for a bigger on-desk presence.
//
// At native sprite size (scale=1) we touch up to 1600 pixels per glyph, so we
// wrap the pass in startWrite/endWrite to keep CS asserted across the whole
// sprite — without it each drawPixel does its own SPI transaction and the
// emoji visibly "wipes in" during the typing animation.
static void drawEmojiSprite(int16_t x, int16_t y, uint8_t spriteUid,
                            uint16_t tintColor, uint8_t scale = kEmojiNoteScale) {
  if (spriteUid >= EMOJI_UNIQUE_SPRITES) return;
  const uint16_t* data = kEmojiSpriteData[spriteUid];
  ++gTftSketchWriteDepth;
  tft.startWrite();
  for (int py = 0; py < EMOJI_SPRITE_PX; ++py) {
    for (int px = 0; px < EMOJI_SPRITE_PX; ++px) {
      if (data[py * EMOJI_SPRITE_PX + px] == 0x0000) continue;
      if (scale <= 1) {
        tft.drawPixel(x + px, y + py, tintColor);
      } else {
        tft.fillRect(x + px * scale, y + py * scale, scale, scale, tintColor);
      }
    }
  }
  tft.endWrite();
  --gTftSketchWriteDepth;
}

static int16_t measureNoteItemWidth(const NoteBodyItem& it) {
  if (it.isEmoji) return (int16_t)(kEmojiNotePx + 4);
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

// Full-screen centered note (pixel GLCD + MDI sprites). Outer frame is black; an inset
// rounded panel is #F5F5DC (beige); body text a darker brown. Long (standard) message is
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
  // #F5F5DC (beige) + darker warm browns for text (fixed RGB565, not theme-driven).
  constexpr uint16_t kNoteBeige     = 0xF7BB;
  // ~#6B4A2E — was 0xC530; deeper brown reads clearer on the cream panel.
  constexpr uint16_t kNoteFg        = 0x7B0C;
  // Lighter brown for the black footer strip (same hue family, more contrast on black).
  constexpr uint16_t kNoteFgFooter  = 0xCD2C;
  // MDI stickers: deep chocolate brown (a touch darker than old 0x49A5 for contrast on beige).
  constexpr uint16_t kEmojiBrown   = 0x3A26;
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
  const int16_t spaceW     = tft.textWidth(" ");
  const int16_t kTextLinePx = (int16_t)(8 * kDeskFontScaleNote);
  const uint16_t lhText     = (uint16_t)(kTextLinePx + 8);
  const uint16_t lhEmoji    = (uint16_t)(kEmojiNotePx + 6);
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
    // Row top `y` — align both GLCD text and emoji to one horizontal band: center each
    // in the line (previously only emoji was centered, so text sat high vs stickers).
    int16_t y = (int16_t)(y0 + (int32_t)r * (int32_t)lineHeight);
    const int16_t yText =
        y + (int16_t)((lineHeight - kTextLinePx) / 2);
    const int16_t yEmojiBase =
        y + (int16_t)((lineHeight - (int16_t)kEmojiNotePx) / 2);

    tft.setTextColor(kNoteFg, kNoteBeige);
    for (size_t i = 0; i < rows[r].size(); ++i) {
      const NoteBodyItem& it = rows[r][i];
      if (it.isEmoji) {
        drawEmojiSprite(x, yEmojiBase, it.spriteUid, kEmojiBrown);
        x += (int16_t)(kEmojiNotePx + 4);
        // Emojis land with a slightly longer beat than individual characters —
        // feels like the sender paused to drop in a reaction.
        if (typingDelayMs) delay((uint32_t)typingDelayMs * 2);
      } else {
        deskFontNote();
        for (size_t c = 0; c < it.text.length(); ++c) {
          const char ch = it.text[c];
          tft.setCursor(x, yText);
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
    tft.setTextColor(kNoteFgFooter, TFT_BLACK);
    tft.setCursor(x, footerY);
    tft.print("DeskNote-");
    tft.print(deskName.length() ? deskName.c_str() : "Desk");
  }

  // Offline banner: painted last so it overlays whichever footer variant was
  // drawn above. Two-tone (dim red on black) keeps it readable against the
  // beige card's shadow without screaming for attention.
  if (!gServerReachable) {
    deskFontChromeMeta();
    const int16_t lineH = (int16_t)(8 * kDeskFontScaleBody + 4);
    const int16_t y = (int16_t)(tft.height() - 6 - lineH);
    const int16_t bandTop = (int16_t)(y - 4);
    tft.fillRect(0, bandTop, tft.width(), (int16_t)(tft.height() - bandTop),
                 TFT_BLACK);
    tft.setTextColor(TFT_RED, TFT_BLACK);
    const char* label = "! offline — last message shown";
    const int16_t tw = tft.textWidth(label);
    int16_t xT = (int16_t)((tft.width() - tw) / 2);
    if (xT < 2) xT = 2;
    tft.setCursor(xT, y);
    tft.print(label);
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

// ---------------------------------------------------------------------------
// Touch input (XPT2046, dedicated SPI bus).
//
// The CYD-R wires the XPT2046 resistive controller on *different* pins from
// the display: T_CLK=25, T_DIN=32, T_OUT=39, T_CS=33, T_IRQ=36. TFT_eSPI
// can only drive one SPI bus (HSPI, used by the ILI9341), so its built-in
// getTouch() never gets a reply and ends up reporting "no touch forever".
//
// To keep touch working regardless of TFT_eSPI's configuration we drive the
// XPT2046 ourselves on a dedicated VSPI instance. The driver is tiny (a
// handful of 12-bit ADC reads per poll) and completely self-contained.
//
// Calibration is a simple min/max box per axis. Defaults below match most
// CYD-R boards in rotation=1 (landscape, USB-C port on the right); if a tap
// lands off-target the easy fix is to edit the four `kRaw*` numbers. The
// fields are persisted under NVS namespace "desktouch", key "calv3".
// ---------------------------------------------------------------------------
static constexpr int PIN_TOUCH_CLK  = 25;
static constexpr int PIN_TOUCH_MISO = 39;  // T_OUT
static constexpr int PIN_TOUCH_MOSI = 32;  // T_DIN
static constexpr int PIN_TOUCH_CS   = 33;
static constexpr int PIN_TOUCH_IRQ  = 36;

static SPIClass touchSpi(VSPI);

// Stored in NVS as calv3. raw* = 12-bit XPT2046 values: rx from the 0xD1
// sequence (Paul "x"), ry from the 0x91 sequence (Paul "y") — each range maps
// to the same-named screen axis (no crossing).
struct TouchCal {
  int16_t rawXMin;
  int16_t rawXMax;
  int16_t rawYMin;
  int16_t rawYMax;
};
// Sensible defaults for most CYD-R units in rotation=1.
static TouchCal gTouchCal = {200, 3900, 200, 3900};
static bool     gTouchInit = false;

// XPT2046 wants a modest SPI clock; 2 MHz matches Paul Stoffregen's
// XPT2046_Touchscreen library (common CYD baseline).
static constexpr uint32_t kTouchSpiHz = 2000000;
static const SPISettings kTouchSpiSettings(kTouchSpiHz, MSBFIRST, SPI_MODE0);

// MIT-licensed reference: XPT2046_Touchscreen.cpp — pick the median-quality
// sample from three ADC readings (rejects one noisy conversion).
static int16_t xptBestTwoAvg(int16_t a, int16_t b, int16_t c) {
  int16_t da = (a > b) ? (a - b) : (b - a);
  int16_t db = (a > c) ? (a - c) : (c - a);
  int16_t dc = (c > b) ? (c - b) : (b - c);
  if (da <= db && da <= dc) return (int16_t)(((int32_t)a + (int32_t)b) >> 1);
  if (db <= da && db <= dc) return (int16_t)(((int32_t)a + (int32_t)c) >> 1);
  return (int16_t)(((int32_t)b + (int32_t)c) >> 1);
}

// One CS assertion, pipelined commands — required for correct pressure + XY on
// XPT2046 (standalone Z1 then Z2 transactions do not match the chip's ADC
// sequencing; |Z2−Z1| stays near zero even when the panel is pressed).
static bool xptReadRawPaul(int16_t& rx, int16_t& ry, int32_t& zOut,
                           int16_t* dbgZ1 = nullptr, int16_t* dbgZ2Plate = nullptr) {
  int16_t data[6];
  int32_t z;

  touchSpi.beginTransaction(kTouchSpiSettings);
  digitalWrite(PIN_TOUCH_CS, LOW);
  delayMicroseconds(1);

  touchSpi.transfer(0xB1);  // Z1 measure
  const int16_t z1 = (int16_t)(touchSpi.transfer16(0xC1) >> 3);  // Z1 result, issue Z2
  if (dbgZ1) *dbgZ1 = z1;
  z = (int32_t)z1 + 4095;
  const int16_t z2p = (int16_t)(touchSpi.transfer16(0x91) >> 3);  // Z2 result, issue X
  if (dbgZ2Plate) *dbgZ2Plate = z2p;
  z -= (int32_t)z2p;

  constexpr int32_t kPressureThreshold = 200;  // Paul's default is 300; lower = lighter taps
  if (z < kPressureThreshold) {
    // Same tail as XPT2046_Touchscreen when not pressed: park controller + clock
    // out last conversions so the next CS session starts clean.
    (void)touchSpi.transfer16(0xD0);
    (void)touchSpi.transfer16(0);
    digitalWrite(PIN_TOUCH_CS, HIGH);
    touchSpi.endTransaction();
    zOut = z;
    rx = ry = 0;
    return false;
  }

  touchSpi.transfer16(0x91);  // dummy X — first conversion after press is noisy
  data[0] = (int16_t)(touchSpi.transfer16(0xD1) >> 3);
  data[1] = (int16_t)(touchSpi.transfer16(0x91) >> 3);
  data[2] = (int16_t)(touchSpi.transfer16(0xD1) >> 3);
  data[3] = (int16_t)(touchSpi.transfer16(0x91) >> 3);
  data[4] = (int16_t)(touchSpi.transfer16(0xD0) >> 3);
  data[5] = (int16_t)(touchSpi.transfer16(0) >> 3);

  digitalWrite(PIN_TOUCH_CS, HIGH);
  touchSpi.endTransaction();

  if (z < 0) z = 0;
  zOut = z;
  rx = xptBestTwoAvg(data[0], data[2], data[4]);
  ry = xptBestTwoAvg(data[1], data[3], data[5]);
  return true;
}

void touchInit() {
  if (gTouchInit) return;
  pinMode(PIN_TOUCH_CS, OUTPUT);
  digitalWrite(PIN_TOUCH_CS, HIGH);
  pinMode(PIN_TOUCH_IRQ, INPUT);
  // Pass ss=-1 so we keep full manual control of the CS line via digitalWrite;
  // the SPI driver would otherwise claim the pin and race our toggles.
  touchSpi.begin(PIN_TOUCH_CLK, PIN_TOUCH_MISO, PIN_TOUCH_MOSI, -1);

  TouchCal c;
  prefs.begin("desktouch", /*readOnly=*/true);
  // calv2 crossed rx/ry vs screen axes; ignore it so old saves don't mis-map.
  const size_t got = prefs.getBytes("calv3", &c, sizeof(c));
  prefs.end();
  if (got == sizeof(c) && c.rawXMax > c.rawXMin && c.rawYMax > c.rawYMin) {
    gTouchCal = c;
  }
  gTouchInit = true;
}

// Returns true when the panel is currently being pressed and fills px/py with
// pixel coordinates in the active screen rotation. Uses the pipelined
// pressure estimate from XPT2046_Touchscreen (z = z1 + 4095 − first X sample),
// then triple-sampled X/Y with median-of-pair averaging.
static bool touchReadPressed(int16_t& px, int16_t& py) {
  // TFT_eSPI has no public getStartCount(); gTftSketchWriteDepth mirrors this
  // sketch's startWrite/endWrite nesting. Skip all touch SPI while non-zero.
  if (gTftSketchWriteDepth != 0) return false;
  if (!gTouchInit) touchInit();

  int16_t rx = 0, ry = 0;
  int32_t zScratch = 0;
  if (!xptReadRawPaul(rx, ry, zScratch)) return false;

  const int16_t w = tft.width();
  const int16_t h = tft.height();
  // rx / ry come from xptReadRawPaul (same ordering as XPT2046_Touchscreen
  // rotation 1). Map each raw axis to the same screen axis — the old build
  // crossed ry→X and rx→Y, which mis-aligned keys after the pipelined driver
  // returned true Paul-order coordinates. If Y is upside-down, swap rawYMin
  // and rawYMax in NVS (or flip the second map below).
  int32_t sx = map((long)rx, (long)gTouchCal.rawXMin, (long)gTouchCal.rawXMax,
                   0L, (long)(w - 1));
  int32_t sy = map((long)ry, (long)gTouchCal.rawYMin, (long)gTouchCal.rawYMax,
                   0L, (long)(h - 1));
  sx = constrain(sx, 0, w - 1);
  sy = constrain(sy, 0, h - 1);
  px = (int16_t)sx;
  py = (int16_t)sy;
  return true;
}

// Returns true if a new tap event is available this call. Requires the finger
// to have been lifted since the previous reported tap — prevents a single
// long press from registering as dozens of key events.
static uint32_t gLastTouchAtMs = 0;
static bool     gTouchReleased = true;
bool pollTapOnce(int16_t& outX, int16_t& outY) {
  int16_t tx = 0, ty = 0;
  const bool pressed = touchReadPressed(tx, ty);
  const uint32_t now = millis();
  if (!pressed) {
    if (now - gLastTouchAtMs > 40) gTouchReleased = true;
    return false;
  }
  if (!gTouchReleased) return false;
  if (now - gLastTouchAtMs < 140) return false;  // debounce
  gTouchReleased = false;
  gLastTouchAtMs = now;
  outX = tx;
  outY = ty;
  return true;
}

static bool pointInRect(int16_t px, int16_t py, int16_t x, int16_t y,
                        int16_t w, int16_t h) {
  return px >= x && py >= y && px < x + w && py < y + h;
}

// ---------------------------------------------------------------------------
// On-screen Wi-Fi provisioning (touch).
//
// Flow:
//   1. Scan visible APs; render a scrollable list.
//   2. User taps an SSID → jumps to password screen.
//   3. QWERTY keyboard edits a masked password field.
//   4. [Connect] saves the pair to NVS ("deskwifi") and rebooting / returning
//      `true` lets the main boot path retry WiFi.connect().
//
// The whole flow is self-contained and blocking — it's only entered when
// connectWifi() has already failed, so commandeering the screen + loop is
// fine. Serial-side JSON provisioning still works as the non-interactive
// backup (useful for headless kiosks).
// ---------------------------------------------------------------------------
struct WifiApEntry {
  String  ssid;
  int32_t rssi;
  bool    secured;
};

static void drawProvHeader(const char* title) {
  tft.fillScreen(TFT_BLACK);
  tft.fillRect(0, 0, tft.width(), 28, 0x18E3);  // subdued plum bar
  tft.setTextColor(TFT_WHITE, 0x18E3);
  tft.setTextSize(1);
  tft.setCursor(10, 8);
  tft.print(title);
}

static void drawProvButton(int16_t x, int16_t y, int16_t w, int16_t h,
                           const char* label, uint16_t bg, uint16_t fg) {
  tft.fillRoundRect(x, y, w, h, 4, bg);
  tft.setTextColor(fg, bg);
  const int16_t tw = tft.textWidth(label);
  tft.setCursor(x + (w - tw) / 2, y + (h - 8) / 2);
  tft.print(label);
}

static std::vector<WifiApEntry> scanVisibleAps() {
  std::vector<WifiApEntry> out;
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true, true);
  delay(100);
  const int n = WiFi.scanNetworks(/*async=*/false, /*show_hidden=*/false);
  for (int i = 0; i < n && (int)out.size() < 20; ++i) {
    WifiApEntry e;
    e.ssid    = WiFi.SSID(i);
    e.rssi    = WiFi.RSSI(i);
    e.secured = WiFi.encryptionType(i) != WIFI_AUTH_OPEN;
    if (e.ssid.length() == 0) continue;
    out.push_back(e);
  }
  WiFi.scanDelete();
  return out;
}

// Returns the chosen SSID (empty String on cancel). Shows up to 6 rows at a
// time with a [Rescan] button at the bottom. Caller blocks on this.
static String pickApFromScan() {
  String selected;
  std::vector<WifiApEntry> aps;
  bool needScan = true;

  while (selected.length() == 0) {
    if (needScan) {
      drawProvHeader("Wi-Fi — scanning...");
      aps = scanVisibleAps();
      needScan = false;
    }

    drawProvHeader("Wi-Fi — tap a network");

    // 4 rows of 40px leaves ~200px for the list plus room for a 40px action
    // bar at the bottom — tall enough for a fingertip on a 2.8" panel.
    constexpr int16_t kRowH = 40;
    constexpr int16_t kListTop = 32;
    const size_t kMaxRows = 4;
    const size_t rows = aps.size() < kMaxRows ? aps.size() : kMaxRows;

    tft.setTextSize(2);
    tft.setTextColor(TFT_WHITE, TFT_BLACK);
    for (size_t i = 0; i < rows; ++i) {
      const int16_t y = kListTop + (int16_t)i * kRowH;
      tft.fillRoundRect(6, y, tft.width() - 12, kRowH - 4, 6, 0x2104);
      tft.setTextColor(TFT_WHITE, 0x2104);
      tft.setCursor(12, y + 10);
      String line = aps[i].ssid;
      if (line.length() > 18) line = line.substring(0, 18);
      tft.print(line);
      // Right-aligned rssi + lock
      String meta = String(aps[i].rssi) + "dBm";
      if (aps[i].secured) meta = "* " + meta;
      tft.setTextSize(1);
      const int16_t tw = tft.textWidth(meta.c_str());
      tft.setCursor(tft.width() - 12 - tw, y + 14);
      tft.print(meta);
      tft.setTextSize(2);
    }
    tft.setTextSize(1);

    const int16_t actH = 36;
    const int16_t actY = tft.height() - actH - 2;
    drawProvButton(6, actY, 140, actH, "Rescan", 0x3A29, TFT_WHITE);
    drawProvButton(tft.width() - 146, actY, 140, actH,
                   "Cancel", 0x4208, TFT_WHITE);

    // Wait for a tap
    while (true) {
      int16_t tx, ty;
      if (!pollTapOnce(tx, ty)) {
        delay(16);
        continue;
      }
      if (pointInRect(tx, ty, 6, actY, 140, actH)) {
        needScan = true;
        break;
      }
      if (pointInRect(tx, ty, tft.width() - 146, actY, 140, actH)) {
        return String();
      }
      for (size_t i = 0; i < rows; ++i) {
        const int16_t y = kListTop + (int16_t)i * kRowH;
        if (pointInRect(tx, ty, 6, y, tft.width() - 12, kRowH - 4)) {
          selected = aps[i].ssid;
          break;
        }
      }
      if (selected.length()) break;
      if (needScan) break;
    }
  }
  return selected;
}

// On-screen QWERTY. Lower/upper layers via [Shift] and a [#+/] symbol layer.
// Writes the edited value to `*outValue` and returns true on [OK], false on
// [Back] so callers can distinguish an empty-string submit (open network)
// from an explicit cancel.
struct KeyCell { const char* label; int16_t x, y, w, h; char ch; };

static bool runKeyboardEntry(const String& prompt, const String& initial,
                             String* outValue) {
  String value = initial;
  bool shifted = false;
  bool symbols = false;

  // Tap-target sizing tuned for a 320×240 resistive panel: every cell ≥ 28px
  // on a side so an adult fingertip can hit it reliably. Header/field take 54
  // px, the 4 key rows take 4×34=136, and the action bar takes 36 — total 226
  // of the 240-px height (a 14-px safe margin at the bottom).
  constexpr int16_t kKeyboardTop = 54;
  constexpr int16_t kKeyPitchX   = 32;
  constexpr int16_t kKeyPitchY   = 34;
  constexpr int16_t kKeyW        = 30;
  constexpr int16_t kKeyH        = 30;

  auto layoutForMode = [&](std::vector<KeyCell>& keys) {
    keys.clear();
    const char* rows_lower[4] = {
        "1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm"};
    const char* rows_upper[4] = {
        "!@#$%^&*()", "QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"};
    const char* rows_sym[4]   = {
        "1234567890", "-_=+[]{}\\|", ";:'\",./?`~", "<>!@#$%&"};
    const char* const* rows =
        symbols ? rows_sym : (shifted ? rows_upper : rows_lower);

    for (int r = 0; r < 4; ++r) {
      const char* row = rows[r];
      const int16_t len = (int16_t)strlen(row);
      const int16_t totalW = len * kKeyPitchX;
      const int16_t startX = (tft.width() - totalW) / 2;
      for (int c = 0; c < len; ++c) {
        KeyCell k;
        k.label = nullptr;
        k.x  = startX + c * kKeyPitchX;
        k.y  = kKeyboardTop + r * kKeyPitchY;
        k.w  = kKeyW;
        k.h  = kKeyH;
        k.ch = row[c];
        keys.push_back(k);
      }
    }
  };

  while (true) {
    tft.fillScreen(TFT_BLACK);
    tft.fillRect(0, 0, tft.width(), 24, 0x18E3);
    tft.setTextColor(TFT_WHITE, 0x18E3);
    tft.setTextSize(1);
    tft.setCursor(8, 8);
    tft.print(prompt.c_str());

    // Field
    tft.fillRoundRect(8, 26, tft.width() - 16, 24, 4, 0x2104);
    tft.setTextColor(TFT_WHITE, 0x2104);
    tft.setCursor(12, 32);
    tft.print(value.c_str());
    tft.print("_");

    std::vector<KeyCell> keys;
    layoutForMode(keys);
    for (auto& k : keys) {
      tft.fillRoundRect(k.x, k.y, k.w, k.h, 5, 0x4208);
      char buf[2] = {k.ch, 0};
      tft.setTextColor(TFT_WHITE, 0x4208);
      tft.setTextSize(2);
      const int16_t tw = tft.textWidth(buf);
      tft.setCursor(k.x + (k.w - tw) / 2, k.y + (k.h - 14) / 2);
      tft.print(buf);
      tft.setTextSize(1);
    }

    // Action row: shft, #+/, space, del, OK — all on one 36-px tall bar at
    // the bottom of the screen. Back sits inside shft as a long-press fallback
    // by reusing Cancel on the prior screen, so we can spend every horizontal
    // pixel on typing targets.
    const int16_t actH = 36;
    const int16_t actY = tft.height() - actH - 2;
    drawProvButton(4, actY, 50, actH,
                   symbols ? "ABC" : (shifted ? "abc" : "Shft"),
                   0x3A29, TFT_WHITE);
    drawProvButton(58, actY, 44, actH, "#+/", 0x3A29, TFT_WHITE);
    drawProvButton(106, actY, 100, actH, "space", 0x3A29, TFT_WHITE);
    drawProvButton(210, actY, 44, actH, "del", 0x632C, TFT_WHITE);
    drawProvButton(258, actY, 58, actH, "OK", 0x05E0, TFT_WHITE);
    // "Back" tucked into the top-left corner over the header bar so it
    // doesn't eat into the keyboard area.
    drawProvButton(tft.width() - 60, 2, 56, 20, "Back", 0x632C, TFT_WHITE);

    // Wait for tap
    while (true) {
      int16_t tx, ty;
      if (!pollTapOnce(tx, ty)) { delay(16); continue; }

      if (pointInRect(tx, ty, tft.width() - 60, 2, 56, 20)) return false;

      bool handled = false;

      if (pointInRect(tx, ty, 4, actY, 50, actH)) {
        if (symbols) {
          symbols = false;
          shifted = false;
        } else
          shifted = !shifted;
        handled = true;
      } else if (pointInRect(tx, ty, 58, actY, 44, actH)) {
        symbols = !symbols;
        handled = true;
      } else if (pointInRect(tx, ty, 106, actY, 100, actH)) {
        if (value.length() < 63) value += ' ';
        handled = true;
      } else if (pointInRect(tx, ty, 210, actY, 44, actH)) {
        if (value.length()) value.remove(value.length() - 1);
        handled = true;
      } else if (pointInRect(tx, ty, 258, actY, 58, actH)) {
        *outValue = value;
        return true;
      } else {
        for (auto& k : keys) {
          if (pointInRect(tx, ty, k.x, k.y, k.w, k.h)) {
            if (value.length() < 63) value += k.ch;
            if (shifted && !symbols) shifted = false;
            handled = true;
            break;
          }
        }
      }

      if (handled) break;
      delay(16);
    }
  }
}

// Tries the provided ssid/pass and returns true on success. Blocks up to
// WIFI_CONNECT_TIMEOUT_MS and draws a small "connecting..." indicator.
static bool tryConnect(const String& ssid, const String& pass) {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextSize(1);
  tft.setCursor(10, 60);
  tft.print("Connecting to:");
  tft.setCursor(10, 80);
  tft.print(ssid.c_str());

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.disconnect(true, true);
  delay(50);
  WiFi.begin(ssid.c_str(), pass.c_str());
  const uint32_t started = millis();
  int dots = 0;
  while (WiFi.status() != WL_CONNECTED &&
         millis() - started < WIFI_CONNECT_TIMEOUT_MS) {
    tft.fillRect(10, 110, 200, 12, TFT_BLACK);
    tft.setCursor(10, 110);
    for (int i = 0; i < (dots % 8) + 1; ++i) tft.print('.');
    dots++;
    delay(400);
  }
  return WiFi.status() == WL_CONNECTED;
}

// Main entry point — keeps looping until the user gets a working connection
// or cancels back to the error screen. Called from connectWifi() when the
// remembered SSID/pass don't work.
bool provisionWifiViaTouch() {
  touchInit();

  while (true) {
    String ssid = pickApFromScan();
    if (ssid.length() == 0) return false;  // user cancelled

    String prompt = "Password for " + ssid;
    String pass;
    if (!runKeyboardEntry(prompt, "", &pass)) {
      // [Back] from keyboard — drop back to the SSID list so the user can
      // pick a different network or bail entirely.
      continue;
    }

    if (!tryConnect(ssid, pass)) {
      tft.setTextColor(TFT_RED, TFT_BLACK);
      tft.setCursor(10, 140);
      tft.print("Connect failed — try again");
      delay(1500);
      continue;
    }

    // Success — persist so next boot skips this flow.
    prefs.begin("deskwifi", /*readOnly=*/false);
    prefs.putString("ssid", ssid);
    prefs.putString("pass", pass);
    prefs.end();

    tft.setTextColor(TFT_GREEN, TFT_BLACK);
    tft.setCursor(10, 140);
    tft.print("Connected! IP: ");
    tft.print(WiFi.localIP().toString().c_str());
    delay(1200);
    return true;
  }
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
    Serial.printf("Wi-Fi failed (status=%d) — launching on-screen setup\n",
                  WiFi.status());
    drawStatus("Wi-Fi failed. Tap to set up.", TFT_RED);
    // Fall through to touch-driven provisioning. If the user cancels we
    // return false so the caller still sees the legacy error screen.
    if (provisionWifiViaTouch()) return true;
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

  // Drive both possible backlight pins HIGH so this firmware lights up on
  // either CYD revision without us having to know which one we're on.
  pinMode(PIN_BACKLIGHT_R1, OUTPUT);
  digitalWrite(PIN_BACKLIGHT_R1, HIGH);
  pinMode(PIN_BACKLIGHT_R2, OUTPUT);
  digitalWrite(PIN_BACKLIGHT_R2, HIGH);

  tft.init();
  tft.setRotation(1);
  touchInit();

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
      return;
    }

    // Non-401: TLS error, timeout, 5xx, or the CDN cutting long-polls. Don't
    // clobber the last rendered message — the partner still wants to read it.
    // Flip the offline flag and re-render whatever screen we were on so the
    // "offline" strip appears along the bottom.
    if (gServerReachable) {
      gServerReachable = false;
      Serial.println(F("Entering offline mode (last message kept on screen)."));
      if (displayState == DisplayState::ShowingMessage) {
        drawMessageScreen(gCachedMainBody, lastPairedDeskName,
                          !gMessageFooterHidden, gCachedMessageType,
                          gCachedTapBody);
      } else if (displayState == DisplayState::WaitingForNote &&
                 lastRenderedIdleBody.length() > 0) {
        drawMessageScreen(lastRenderedIdleBody, lastPairedDeskName,
                          !gMessageFooterHidden, "", "");
      } else if (displayState == DisplayState::Boot ||
                 displayState == DisplayState::Error) {
        // Never had a paired render to show — fall back to the legacy error
        // screen so the user still sees what went wrong.
        String detail = latest.httpStatus < 0
                          ? HTTPClient::errorToString(latest.httpStatus)
                          : ("HTTP " + String(latest.httpStatus));
        enterError("Server unreachable", detail);
      }
    }
    return;
  }

  // Success clears the offline banner if we were showing it.
  if (!gServerReachable) {
    gServerReachable = true;
    gLastServerOkMs = millis();
    Serial.println(F("Server reachable again — clearing offline banner."));
    // Force a redraw so the banner disappears even if the payload below
    // decides the state didn't change (same note id, same idle body).
    if (displayState == DisplayState::ShowingMessage) {
      drawMessageScreen(gCachedMainBody, lastPairedDeskName,
                        !gMessageFooterHidden, gCachedMessageType,
                        gCachedTapBody);
    } else if (displayState == DisplayState::WaitingForNote &&
               lastRenderedIdleBody.length() > 0) {
      drawMessageScreen(lastRenderedIdleBody, lastPairedDeskName,
                        !gMessageFooterHidden, "", "");
    }
  } else {
    gLastServerOkMs = millis();
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

  // Temporary XPT2046 raw logger (remove after verifying Z / XY on Serial).
  // Temporary: one pipelined read per loop — z1/z2 are the first two plate
  // samples; paul_z matches XPT2046_Touchscreen pressure; rx/ry are valid when
  // paul_z crosses the press threshold.
  if (gTouchInit && gTftSketchWriteDepth == 0) {
    int16_t z1d = 0, z2d = 0, rx = 0, ry = 0;
    int32_t paulZ = 0;
    const bool pressed = xptReadRawPaul(rx, ry, paulZ, &z1d, &z2d);
    const int32_t diff = (int32_t)z2d - (int32_t)z1d;
    if (labs((long)diff) > 30 || pressed) {
      Serial.printf(
          "touch raw: z1=%d z2=%d diff=%ld paul_z=%ld rx=%d ry=%d\n", z1d, z2d,
          (long)diff, (long)paulZ, (int)rx, (int)ry);
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
