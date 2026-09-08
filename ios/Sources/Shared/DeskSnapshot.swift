import Foundation
import Supabase

/// What one desk display is showing, as far as the database knows.
///
/// The desk polls `/api/device/latest`, which hands it the newest **queued**
/// note addressed to the desk's owner and, when nothing is queued, the most
/// recent non-secret note as the idle hero. This mirrors that same choice
/// from the phone, so the widget and the wood-and-plastic thing on the desk
/// agree about what is on screen.
struct DeskSnapshot: Codable, Identifiable, Hashable, Sendable {
    enum Owner: String, Codable, Sendable {
        case mine
        case theirs
        case shared

        var label: String {
            switch self {
            case .mine: return "Your desk"
            case .theirs: return "Their desk"
            case .shared: return "Shared desk"
            }
        }
    }

    struct Message: Codable, Hashable, Sendable {
        let body: String
        /// A secret is hidden until someone taps the desk, so the widget
        /// says one exists without giving it away.
        let isSecret: Bool
        let senderLabel: String
        let createdAt: Date
        let status: NoteDeliveryStatus?

        var seenState: SeenState { SeenState(status) }
    }

    let deviceID: UUID
    let deskName: String
    let owner: Owner
    let accentID: String?
    let online: Bool
    let lastSeenAt: Date?
    let message: Message?
    /// When this was read, so a stale widget can admit it.
    let capturedAt: Date

    var id: UUID { deviceID }
}

enum DeskSnapshotAPI {
    /// Reads every desk the signed-in user can see, newest desk first in
    /// the same order the app lists them.
    ///
    /// Returns nil when nobody is signed in — the widget shows its
    /// "sign in" placeholder rather than an empty desk.
    static func fetchAll() async -> [DeskSnapshot]? {
        guard let session = try? await Cloud.client.auth.session else { return nil }
        let viewerID = session.user.id
        let partner = await RelationshipAPI.partner(userID: viewerID)
        let devices = await DevicesAPI.paired(userID: viewerID, partnerID: partner.partnerID)
        return await build(viewerID: viewerID, partner: partner, devices: devices)
    }

    /// The same read for a caller that already knows the pair and the
    /// desks — the app does, and re-querying them on every refresh just to
    /// feed the widget would double its network traffic.
    static func build(
        viewerID: UUID,
        partner: PartnerInfo,
        devices: [DeviceRow]
    ) async -> [DeskSnapshot] {
        guard !devices.isEmpty else { return [] }

        // `/api/device/latest` keys the message off the desk's *owner*,
        // not the desk itself, so one query per distinct owner is enough.
        let ownerIDs = Array(Set(devices.map(\.ownerID)))
        let notes = await recentNotes(recipientIDs: ownerIDs)
        let secretNoteIDs = await secretNoteIDs(among: notes.map(\.id))

        let now = Date()
        return devices.map { device in
            let owner: DeskSnapshot.Owner =
                device.ownerID == viewerID ? .mine
                : device.ownerID == partner.partnerID ? .theirs
                : .shared

            let mine = notes.filter { $0.recipientID == device.ownerID }
            // What the desk is showing: the newest queued note, or — once
            // it has been read and cleared — the newest note that was not
            // a one-time secret.
            let shown = mine.first { $0.status == "queued" }
                ?? mine.first { !secretNoteIDs.contains($0.id) }

            return DeskSnapshot(
                deviceID: device.id,
                deskName: device.name,
                owner: owner,
                accentID: device.accentColor,
                online: device.online ?? false,
                lastSeenAt: device.lastSeenAt,
                message: shown.map { note in
                    DeskSnapshot.Message(
                        body: note.body,
                        isSecret: secretNoteIDs.contains(note.id),
                        senderLabel: note.senderID == viewerID
                            ? "You"
                            : partner.label(fallback: "Your partner"),
                        createdAt: note.createdAt,
                        status: note.status.flatMap { NoteDeliveryStatus(rawValue: $0) })
                },
                capturedAt: now)
        }
    }

    private struct NoteRow: Decodable, Sendable {
        let id: UUID
        let body: String
        let status: String?
        let createdAt: Date
        let senderID: UUID
        let recipientID: UUID

        enum CodingKeys: String, CodingKey {
            case id, body, status, createdAt
            case senderID = "senderId"
            case recipientID = "recipientId"
        }
    }

    /// Ten per owner is what `/api/device/latest` looks back over when it
    /// skips secrets, so twenty covers a linked pair with room to spare.
    private static func recentNotes(recipientIDs: [UUID]) async -> [NoteRow] {
        let rows: [NoteRow]? = try? await Cloud.client.from("notes")
            .select("id, body, status, created_at, sender_id, recipient_id")
            .in("recipient_id", values: recipientIDs)
            .order("created_at", ascending: false)
            .limit(10 * max(1, recipientIDs.count))
            .execute().value
        return rows ?? []
    }

    private static func secretNoteIDs(among noteIDs: [UUID]) async -> Set<UUID> {
        struct Row: Decodable { let noteID: UUID?; enum CodingKeys: String, CodingKey { case noteID = "noteId" } }
        guard !noteIDs.isEmpty else { return [] }
        let rows: [Row]? = try? await Cloud.client.from("messages")
            .select("note_id")
            .in("note_id", values: noteIDs)
            .eq("message_type", value: DeskMessageType.secret.rawValue)
            .execute().value
        return Set((rows ?? []).compactMap(\.noteID))
    }
}
