import Foundation
import Supabase

enum MessagesAPI {
    private static let client = Cloud.client

    /// Port of `sendDeskMessages`.
    ///
    /// Two tables, in this order: a row in `notes` per destination (the
    /// queue the ESP32 desks drain) and then the matching `messages` row
    /// carrying `note_id`, so history can report seen / unseen from the
    /// note's status. If the second insert fails the notes are deleted
    /// again — a queued note with no message behind it would reach the
    /// desk but never appear in history.
    @discardableResult
    static func send(
        content: String,
        toDeviceIDs: [UUID],
        devices: [DeviceRow],
        senderID: UUID,
        messageType: DeskMessageType = .standard,
        isPinned: Bool? = nil
    ) async throws -> String {
        let body: String
        switch DeskMessageValidation.validate(content) {
        case .success(let value): body = value
        case .failure(let error): throw error
        }

        var seen = Set<UUID>()
        let unique = toDeviceIDs.filter { seen.insert($0).inserted }

        guard !unique.isEmpty else {
            throw DeskError("Pick at least one desk to send to.")
        }
        guard unique.count <= 8 else {
            throw DeskError("Too many destinations — try sending in smaller batches.")
        }

        let deviceByID = Dictionary(uniqueKeysWithValues: devices.map { ($0.id, $0) })
        guard unique.allSatisfy({ deviceByID[$0] != nil }) else {
            throw DeskError(
                "One of those desks is not available on your account — refresh and try again.")
        }

        let noteRows = unique.map { deviceID in
            NoteInsert(
                senderID: senderID,
                recipientID: deviceByID[deviceID]!.ownerID,
                body: body,
                status: NoteDeliveryStatus.queued.rawValue,
                deviceID: deviceID)
        }

        let inserted: [InsertedID]
        do {
            inserted = try await client.from("notes")
                .insert(noteRows).select("id").execute().value
        } catch {
            throw DeskError(
                "We could not queue your message for the displays. Please try again.")
        }

        guard inserted.count == unique.count else {
            try? await deleteNotes(inserted.map(\.id))
            throw DeskError("Something went wrong while saving. Please try again.")
        }

        let messageRows = zip(unique, inserted).map { deviceID, note in
            MessageInsert(
                fromUserID: senderID,
                toDeviceID: deviceID,
                content: body,
                messageType: messageType.rawValue,
                // Without an explicit choice, the desk's own "pin by
                // default" setting decides.
                isPinned: isPinned ?? (deviceByID[deviceID]?.pinnedModeEnabled ?? false),
                noteID: note.id)
        }

        do {
            try await client.from("messages").insert(messageRows).execute()
        } catch {
            try? await deleteNotes(inserted.map(\.id))
            throw DeskError(
                "Could not save your message. If this keeps happening, check that the messages table and note_id column exist in Supabase.")
        }

        return unique.count == 1
            ? "Sent to your desk."
            : "Sent to \(unique.count) desks — they will see it when their display comes online."
    }

    private static func deleteNotes(_ ids: [UUID]) async throws {
        guard !ids.isEmpty else { return }
        try await client.from("notes").delete().in("id", values: ids).execute()
    }

    // MARK: - History

    /// Ten per page, same as the web's "Recent history".
    static let pageSize = 10

    struct HistoryPage: Equatable, Sendable {
        var entries: [MessageHistoryEntry] = []
        var page = 1
        var pageCount = 1
        var totalCount = 0
    }

    /// Port of `fetchMessageHistoryPage`, including the two follow-up
    /// lookups it does: note status for the seen chip, and sender profiles
    /// for the "You" / partner-name label.
    static func history(
        viewerID: UUID,
        pairedDeviceIDs: [UUID],
        myDeskDeviceIDs: [UUID],
        filter: HistoryFilter,
        page: Int
    ) async throws -> HistoryPage {
        // "On your desk" with no desk of your own can only ever be empty,
        // and an `in.()` with no values is a PostgREST syntax error.
        if filter == .desk && myDeskDeviceIDs.isEmpty {
            return HistoryPage()
        }

        var countQuery = client.from("messages")
            .select("id", head: true, count: .exact)
        var dataQuery = client.from("messages").select(MessageRow.columns)

        switch filter {
        case .sent:
            countQuery = countQuery.eq("from_user_id", value: viewerID)
            dataQuery = dataQuery.eq("from_user_id", value: viewerID)
        case .desk:
            countQuery = countQuery.in("to_device_id", values: myDeskDeviceIDs)
            dataQuery = dataQuery.in("to_device_id", values: myDeskDeviceIDs)
        case .all:
            if pairedDeviceIDs.isEmpty {
                countQuery = countQuery.eq("from_user_id", value: viewerID)
                dataQuery = dataQuery.eq("from_user_id", value: viewerID)
            } else {
                let ids = pairedDeviceIDs.map(\.uuidString).joined(separator: ",")
                let expression = "from_user_id.eq.\(viewerID.uuidString),to_device_id.in.(\(ids))"
                countQuery = countQuery.or(expression)
                dataQuery = dataQuery.or(expression)
            }
        }

        let from = (page - 1) * pageSize
        let countResponse = try await countQuery.execute()
        let totalCount = countResponse.count ?? 0
        let pageCount = totalCount == 0 ? 1 : max(1, Int(ceil(Double(totalCount) / Double(pageSize))))

        let rows: [MessageRow] = try await dataQuery
            .order("created_at", ascending: false)
            .range(from: from, to: from + pageSize - 1)
            .execute().value

        guard !rows.isEmpty else {
            return HistoryPage(entries: [], page: page, pageCount: pageCount, totalCount: totalCount)
        }

        return HistoryPage(
            entries: await entries(from: rows, viewerID: viewerID),
            page: page,
            pageCount: pageCount,
            totalCount: totalCount)
    }

    private static func entries(
        from rows: [MessageRow],
        viewerID: UUID
    ) async -> [MessageHistoryEntry] {
        let noteIDs = Array(Set(rows.compactMap(\.noteID)))
        var statusByNote: [UUID: NoteDeliveryStatus] = [:]
        if !noteIDs.isEmpty,
           let notes: [NoteStatusRow] = try? await client.from("notes")
            .select("id, status").in("id", values: noteIDs).execute().value {
            for note in notes {
                if let raw = note.status, let status = NoteDeliveryStatus(rawValue: raw) {
                    statusByNote[note.id] = status
                }
            }
        }

        let senderIDs = Array(Set(rows.map(\.fromUserID)))
        var nameByUser: [UUID: String] = [:]
        if let profiles: [ProfileRow] = try? await client.from("profiles")
            .select("id, display_name").in("id", values: senderIDs).execute().value {
            for profile in profiles {
                if let name = profile.displayName.nonEmpty { nameByUser[profile.id] = name }
            }
        }

        return rows.map { row in
            MessageHistoryEntry(
                id: row.id,
                fromUserID: row.fromUserID,
                toDeviceID: row.toDeviceID,
                content: row.content,
                messageType: row.messageType.flatMap(DeskMessageType.init) ?? .standard,
                isPinned: row.isPinned,
                createdAt: row.createdAt,
                senderLabel: row.fromUserID == viewerID
                    ? "You"
                    : nameByUser[row.fromUserID] ?? "Your partner",
                deviceName: "",
                noteStatus: row.noteID.flatMap { statusByNote[$0] })
        }
    }

    /// Fills in desk names once the device list is known, so the query
    /// above does not have to join `devices` it already has in memory.
    static func attachDeviceNames(
        _ entries: [MessageHistoryEntry],
        names: [UUID: String]
    ) -> [MessageHistoryEntry] {
        entries.map { entry in
            var copy = entry
            copy.deviceName = names[entry.toDeviceID] ?? "Desk"
            return copy
        }
    }
}
