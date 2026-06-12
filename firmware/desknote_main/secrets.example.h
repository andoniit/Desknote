// DeskNote firmware secrets — TEMPLATE.
//
// Copy this file to secrets.h (same folder) and fill in real values before
// building. secrets.h is gitignored so credentials never reach the repo.
#pragma once

// Must match DEVICE_API_KEY in the server environment (Vercel project env
// vars / .env.local); the server returns 401 from /api/device/register if
// they differ.
const char* kDeviceApiKey = "YOUR_DEVICE_API_KEY";

// HiveMQ Cloud cluster + Access Management credential (shared by all desks).
const char*    kMqttHost = "YOUR_HIVEMQ_HOST";  // e.g. xxxx.s1.eu.hivemq.cloud
const uint16_t kMqttPort = 8883;
const char*    kMqttUser = "YOUR_HIVEMQ_USER";
const char*    kMqttPass = "YOUR_HIVEMQ_PASS";
