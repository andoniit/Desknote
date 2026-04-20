// DeskNote — TFT_eSPI User_Setup.h for ESP32-2432S028R (CYD, resistive "R")
//
// Copy the contents of this file over the top of:
//   ~/Documents/Arduino/libraries/TFT_eSPI/User_Setup.h
//
// (Back up the original first: cp User_Setup.h User_Setup.h.bak)
//
// Why this file lives here instead of next to the library:
//   TFT_eSPI is configured globally from its own folder, not from the sketch
//   folder. Keeping a committed reference here means that if the library
//   upgrade wipes your custom User_Setup.h, you have a known-good copy to
//   restore. See docs/firmware-cyd-setup.md section 5a for context.

#define USER_SETUP_INFO "DeskNote / ESP32-2432S028R"

// The 2432S028R panel is an ILI9341 variant that needs the adjusted init
// sequence. Using plain ILI9341_DRIVER leaves the screen stuck on white.
#define ILI9341_2_DRIVER

#define TFT_WIDTH  240
#define TFT_HEIGHT 320

// Panel SPI (HSPI)
#define TFT_MISO 12
#define TFT_MOSI 13
#define TFT_SCLK 14
#define TFT_CS   15
#define TFT_DC    2
#define TFT_RST  -1        // tied to EN on this board
#define TFT_BL   21        // backlight; some later revisions use 27
#define TFT_BACKLIGHT_ON HIGH

// Resistive touch (XPT2046) shares the same SPI bus
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

// SPI clocks that are reliable on the CYD. If you see pixel noise, halve
// SPI_FREQUENCY.
#define SPI_FREQUENCY        55000000
#define SPI_READ_FREQUENCY   20000000
#define SPI_TOUCH_FREQUENCY   2500000

#define USE_HSPI_PORT
