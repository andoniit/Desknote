// DeskNote — keep a freshly installed firmware on probation.
//
// With rollback enabled in the bootloader (it is, in esp32 core 3.x), a build
// that arrives over the air first boots as "pending verify". The Arduino
// core's weak default of this hook returns false, which makes initArduino()
// mark it valid immediately — before it has shown it can do anything useful.
//
// Returning true defers that to the sketch: confirmFirmwareHealthy() marks the
// build valid once it has reached the DeskNote server with a valid token. If
// it reboots or crashes before then, the bootloader boots the previous build.
//
// This lives in a .cpp file of its own because Arduino's prototype generator
// mangles the prototypes of every later function in a .ino when it meets an
// extern "C" definition there.

extern "C" bool verifyRollbackLater() { return true; }
