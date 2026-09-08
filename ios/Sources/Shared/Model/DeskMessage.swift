import Foundation

/// Mirrors `public.messages.message_type` — the same four values the web
/// app writes and the `messages_message_type_check` constraint allows.
enum DeskMessageType: String, Codable, Sendable {
    case standard
    case quickSend = "quick_send"
    case system
    case secret
}

/// Mirrors `public.notes.status`, the delivery queue the desks drain.
enum NoteDeliveryStatus: String, Codable, Sendable {
    case queued
    case delivered
    case seen
}

/// How the reader should think about a message: has the desk shown it yet?
/// `delivered` still counts as unseen — it reached the desk but nobody
/// pressed it. Port of `lib/messages/delivery-status.ts`.
enum SeenState {
    case seen
    case unseen
    case unknown

    init(_ status: NoteDeliveryStatus?) {
        switch status {
        case .seen: self = .seen
        case .queued, .delivered: self = .unseen
        case nil: self = .unknown
        }
    }

    var label: String {
        switch self {
        case .seen: return "Seen"
        case .unseen: return "Unseen"
        case .unknown: return "Status n/a"
        }
    }
}

/// Which slice of history is on screen. Port of `MessageHistoryFilter`.
enum HistoryFilter: String, CaseIterable, Identifiable {
    case all
    case sent
    case desk

    var id: String { rawValue }

    var label: String {
        switch self {
        case .all: return "All"
        case .sent: return "Sent by you"
        case .desk: return "On your desk"
        }
    }
}

/// One row for the history list, after the sender profile and note status
/// have been joined in. Port of `MessageHistoryEntry`.
struct MessageHistoryEntry: Identifiable, Hashable {
    let id: UUID
    let fromUserID: UUID
    let toDeviceID: UUID
    let content: String
    let messageType: DeskMessageType
    let isPinned: Bool
    let createdAt: Date
    let senderLabel: String
    var deviceName: String
    let noteStatus: NoteDeliveryStatus?

    var seenState: SeenState { SeenState(noteStatus) }
}

enum DeskMessageValidation {
    /// Matches the `messages_content_length` check in Postgres and
    /// `DESK_MESSAGE_MAX_LENGTH` on the web — little notes stay little.
    static let maxLength = 140

    /// `.success` carries the trimmed text that should actually be stored.
    static func validate(_ raw: String) -> Result<String, DeskError> {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return .failure(DeskError("Write something before sending."))
        }
        if trimmed.count > maxLength {
            return .failure(DeskError(
                "Keep it under \(maxLength) characters — little notes stay little."))
        }
        return .success(trimmed)
    }
}

/// A message meant for the user, not a stack trace. Everything that can
/// fail in this app fails with one of these so views have something they
/// can put on screen directly.
struct DeskError: LocalizedError, Equatable {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}
