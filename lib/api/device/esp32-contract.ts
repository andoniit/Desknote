/**
 * DeskNote — ESP32 device HTTP contract (JSON only).
 *
 * ## Auth model (production)
 * 1. **Factory / first boot** — `POST /api/device/register` with header `X-Device-Key: <DEVICE_API_KEY>`.
 *    Response includes `device_token` **once**. Store `device_id` + `device_token` in NVS; never bake
 *    `DEVICE_API_KEY` into consumer firmware if avoidable.
 * 2. **Runtime** — Send `Authorization: Bearer <device_token>` and identify the desk with
 *    `X-Device-Id: <uuid>` **or** query `?deviceId=<uuid>` on GET.
 * 3. **Legacy desks** (no `device_token_hash` in DB yet) — may still use `X-Device-Key` + `deviceId`
 *    until re-registered.
 *
 * ## Examples
 *
 * Register (server secret; run from provisioning tool or secure build step):
 * ```http
 * POST /api/device/register
 * X-Device-Key: <DEVICE_API_KEY>
 * Content-Type: application/json
 *
 * {"firmware_version":"1.0.0"}
 * ```
 * → `200 {"device_id":"...","pairing_code":"123456","device_token":"64-hex..."}`
 *
 * Heartbeat:
 * ```http
 * POST /api/device/heartbeat
 * Authorization: Bearer <device_token>
 * X-Device-Id: <device_id>
 * Content-Type: application/json
 *
 * {"firmware_version":"1.0.1"}
 * ```
 * → `200 {"ok":true,"server_time":"2026-04-17T12:00:00.000Z"}`
 *
 * Latest queued message (newest first):
 * ```http
 * GET /api/device/latest?deviceId=<device_id>
 * Authorization: Bearer <device_token>
 * ```
 * → `200 {"message":{"id":"...","body":"Hi","created_at":"..."}}` or `{"message":null,"reason":"unpaired"}`
 *
 * Mark seen:
 * ```http
 * POST /api/device/seen
 * Authorization: Bearer <device_token>
 * X-Device-Id: <device_id>
 * Content-Type: application/json
 *
 * {"note_id":"<uuid>"}
 * ```
 * → `200 {"ok":true}`
 *
 * ## Legacy notes poll (unchanged)
 * `GET /api/device/notes?device_id=...` + `X-Device-Key` — FIFO queue; prefer `latest` + `seen` for new firmware.
 */
export {};
