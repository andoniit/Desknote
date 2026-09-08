import Foundation
import Supabase

extension DevicesAPI {
    private static let claimErrors: [String: String] = [
        "not_signed_in": "Sign in first, then try pairing again.",
        "invalid_code_format": "Pairing codes are six digits — check what the display shows.",
        "invalid_name": "Pick a short name for this desk.",
        "invalid_location": "That location name is a little long.",
        "invalid_theme": "Pick one of the themes from the list.",
        "code_not_found": "We could not find that code. Make sure the desk is powered on and showing a code, then try again.",
        "already_claimed": "This desk is already linked to another account. If it is yours, sign in with that account or factory-reset the device.",
    ]

    /// Port of `claimDeviceAction`. Returns the line to show on success.
    static func claim(
        pairingCode rawCode: String,
        name: String,
        location: String,
        theme: String
    ) async throws -> String {
        struct Params: Encodable {
            let p_pairing_code: String
            let p_name: String
            let p_location_name: String?
            let p_theme: String
        }
        struct Payload: Decodable {
            let ok: Bool?
            let error: String?
            let alreadyYours: Bool?
            enum CodingKeys: String, CodingKey {
                case ok, error
                case alreadyYours = "already_yours"
            }
        }

        if let message = DeviceValidation.validatePairingCode(rawCode) { throw DeskError(message) }
        if let message = DeviceValidation.validateName(name) { throw DeskError(message) }
        if let message = DeviceValidation.validateLocation(location) { throw DeskError(message) }
        guard DeskTheme.isValid(theme) else { throw DeskError(claimErrors["invalid_theme"]!) }

        let trimmedLocation = location.trimmingCharacters(in: .whitespacesAndNewlines)
        let params = Params(
            p_pairing_code: DeviceValidation.normalizePairingCode(rawCode),
            p_name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            p_location_name: trimmedLocation.isEmpty ? nil : trimmedLocation,
            p_theme: theme)

        let payload: Payload?
        do {
            payload = try await client
                .rpc("desknote_claim_device", params: params).execute().value
        } catch {
            throw DeskError("Something went wrong while saving. Please try again shortly.")
        }

        guard payload?.ok == true else {
            let key = payload?.error ?? "unknown"
            throw DeskError(claimErrors[key] ?? claimErrors["code_not_found"]!)
        }

        return payload?.alreadyYours == true
            ? "This desk is already on your account — no changes were needed."
            : "Paired. Notes for you will route to this desk when it is online."
    }

    /// Port of `updateDeviceSettingsAction`. Ownership is enforced by the
    /// `devices update by owner` policy; it is checked here too so the
    /// user gets a sentence rather than a silent no-op row count.
    static func updateSettings(
        deviceID: UUID,
        ownerID: UUID,
        viewerID: UUID,
        name: String,
        location: String,
        theme: String,
        accent: String,
        noteCardBackground: String,
        pinnedModeEnabled: Bool
    ) async throws -> String {
        if let message = DeviceValidation.validateName(name) { throw DeskError(message) }
        if let message = DeviceValidation.validateLocation(location) { throw DeskError(message) }
        guard DeskTheme.isValid(theme) else {
            throw DeskError("Pick one of the desk themes from the list.")
        }
        guard DeskAccent.isValid(accent) else {
            throw DeskError("Pick one of the accent colors from the list.")
        }
        guard DeskNoteCardBackground.isValid(noteCardBackground) else {
            throw DeskError("Pick one of the message card backgrounds from the list.")
        }
        guard ownerID == viewerID else {
            throw DeskError("You can only change settings for desks on your own account.")
        }

        let trimmedLocation = location.trimmingCharacters(in: .whitespacesAndNewlines)
        let update = DeviceSettingsUpdate(
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            locationName: trimmedLocation.isEmpty ? nil : trimmedLocation,
            theme: theme,
            accentColor: accent,
            noteCardBackground: noteCardBackground,
            pinnedModeEnabled: pinnedModeEnabled)

        do {
            try await client.from("devices").update(update)
                .eq("id", value: deviceID)
                .eq("owner_id", value: viewerID)
                .execute()
        } catch {
            let message = error.localizedDescription
            if message.contains("column")
                && (message.contains("accent") || message.contains("note_card")) {
                throw DeskError("Your database is missing the latest desk columns. Apply migrations in Supabase, then try again.")
            }
            throw DeskError("Something went wrong while saving. Please try again shortly.")
        }

        return "Saved. This desk will pick up the new look on its next sync."
    }

    /// Port of `unpairDeviceAction`: hand the desk back to the unclaimed
    /// pool. Clearing `device_token_hash` forces the hardware to register
    /// again, and a fresh six-digit code means whoever claims it next
    /// types something new.
    ///
    /// The update runs as the signed-in user rather than a service role —
    /// migration `20260420080000` relaxed the policy's WITH CHECK to allow
    /// `owner_id is null`, and no row is selected back, so the post-update
    /// visibility check never comes into play.
    static func unpair(deviceID: UUID, ownerID: UUID, viewerID: UUID) async throws -> String {
        guard ownerID == viewerID else {
            throw DeskError("Only the desk's owner can unpair it.")
        }

        // Six digits is a million codes for a fleet of two, so a collision
        // is not worth a retry loop — the owner would just see an error
        // and tap again.
        let update = DeviceUnpairUpdate(
            ownerID: nil,
            deviceTokenHash: nil,
            pairingCode: String(Int.random(in: 100_000...999_999)),
            online: false)

        do {
            try await client.from("devices").update(update)
                .eq("id", value: deviceID)
                .execute()
        } catch {
            throw DeskError("Something went wrong while unpairing. Please try again shortly.")
        }

        return "Desk unpaired. Power-cycle the display — it will show a fresh six-digit code so you (or someone else) can claim it again."
    }
}
