import Foundation

/// One row of `public.devices`, with the same column list the web's
/// `lib/data/paired-devices.ts` selects.
struct DeviceRow: Decodable, Identifiable, Hashable, Sendable {
    let id: UUID
    let name: String
    let locationName: String?
    let theme: String?
    let accentColor: String?
    let noteCardBackground: String?
    let pinnedModeEnabled: Bool?
    let firmwareVersion: String?
    let ownerID: UUID
    let online: Bool?
    let lastSeenAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, name, theme, online
        case locationName, accentColor, noteCardBackground
        case pinnedModeEnabled, firmwareVersion, lastSeenAt
        // `owner_id` becomes `ownerId` under snake-case conversion; the
        // property is spelled `ownerID` to read like Swift.
        case ownerID = "ownerId"
    }

    static let columns = """
        id, name, location_name, theme, accent_color, note_card_background, \
        pinned_mode_enabled, firmware_version, owner_id, online, last_seen_at
        """
}

/// One row of `public.messages`.
struct MessageRow: Decodable, Identifiable, Hashable, Sendable {
    let id: UUID
    let fromUserID: UUID
    let toDeviceID: UUID
    let content: String
    let messageType: String?
    let isPinned: Bool
    let createdAt: Date
    let noteID: UUID?

    enum CodingKeys: String, CodingKey {
        case id, content, createdAt, isPinned
        case fromUserID = "fromUserId"
        case toDeviceID = "toDeviceId"
        case messageType
        case noteID = "noteId"
    }

    static let columns =
        "id, from_user_id, to_device_id, content, message_type, is_pinned, created_at, note_id"
}

/// The subset of `public.notes` the app reads back: history joins on the
/// note to show whether the desk has actually displayed the message.
struct NoteStatusRow: Decodable, Identifiable, Sendable {
    let id: UUID
    let status: String?
}

/// Only the id is needed after inserting into `notes` — it becomes
/// `messages.note_id`.
struct InsertedID: Decodable, Sendable {
    let id: UUID
}

/// One row of `public.profiles`.
struct ProfileRow: Decodable, Identifiable, Sendable {
    let id: UUID
    let displayName: String?
}

// MARK: - Insert / update payloads

/// A queued delivery for one desk. Mirrors the `notes` insert the web's
/// `sendDeskMessages` performs.
struct NoteInsert: Encodable, Sendable {
    let senderID: UUID
    let recipientID: UUID
    let body: String
    let status: String
    let deviceID: UUID?

    enum CodingKeys: String, CodingKey {
        case body, status
        case senderID = "sender_id"
        case recipientID = "recipient_id"
        case deviceID = "device_id"
    }
}

/// The stored message that pairs with a queued note.
struct MessageInsert: Encodable, Sendable {
    let fromUserID: UUID
    let toDeviceID: UUID
    let content: String
    let messageType: String
    let isPinned: Bool
    let noteID: UUID

    enum CodingKeys: String, CodingKey {
        case content
        case fromUserID = "from_user_id"
        case toDeviceID = "to_device_id"
        case messageType = "message_type"
        case isPinned = "is_pinned"
        case noteID = "note_id"
    }
}

/// Everything the owner can change about a desk from Settings.
struct DeviceSettingsUpdate: Encodable, Sendable {
    let name: String
    let locationName: String?
    let theme: String
    let accentColor: String
    let noteCardBackground: String
    let pinnedModeEnabled: Bool

    enum CodingKeys: String, CodingKey {
        case name, theme
        case locationName = "location_name"
        case accentColor = "accent_color"
        case noteCardBackground = "note_card_background"
        case pinnedModeEnabled = "pinned_mode_enabled"
    }
}

/// Hands a desk back to the unclaimed pool. The `devices update by owner`
/// policy allows this exact shape — `USING` still requires the caller to
/// be the current owner, `WITH CHECK` permits the new row's null owner.
struct DeviceUnpairUpdate: Encodable, Sendable {
    let ownerID: String?
    let deviceTokenHash: String?
    let pairingCode: String
    let online: Bool

    enum CodingKeys: String, CodingKey {
        case online
        case ownerID = "owner_id"
        case deviceTokenHash = "device_token_hash"
        case pairingCode = "pairing_code"
    }
}

/// Upserted into `profiles` when the display name changes.
struct ProfileUpsert: Encodable, Sendable {
    let id: UUID
    let displayName: String?

    enum CodingKeys: String, CodingKey {
        case id
        case displayName = "display_name"
    }
}
