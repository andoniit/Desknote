import Foundation

/// The desk's overall look. Port of `lib/devices/themes.ts` — the ids are
/// what lands in `devices.theme`, so the firmware reads the same strings.
struct DeskTheme: Identifiable, Hashable {
    let id: String
    let label: String
    let hint: String

    static let all: [DeskTheme] = [
        .init(id: "cream", label: "Cream & plum",
              hint: "Header, menus, and paired screens — soft default like the app."),
        .init(id: "blush", label: "Blush", hint: "Warm rose frame and menu tones."),
        .init(id: "plum", label: "Plum", hint: "Deeper frame and menu background."),
        .init(id: "sage", label: "Sage", hint: "Quiet green frame and menu tones."),
    ]

    static func isValid(_ id: String) -> Bool { all.contains { $0.id == id } }

    static func label(_ id: String?) -> String {
        guard let id else { return "—" }
        return all.first { $0.id == id }?.label ?? id
    }
}

/// Highlight colour. Port of `lib/devices/accents.ts`.
struct DeskAccent: Identifiable, Hashable {
    let id: String
    let label: String

    static let all: [DeskAccent] = [
        .init(id: "rose", label: "Rose"),
        .init(id: "blush", label: "Blush"),
        .init(id: "plum", label: "Plum"),
        .init(id: "sage", label: "Sage"),
        .init(id: "cream", label: "Cream"),
    ]

    static func isValid(_ id: String) -> Bool { all.contains { $0.id == id } }

    static func label(_ id: String?) -> String {
        guard let id else { return "—" }
        return all.first { $0.id == id }?.label ?? id
    }
}

/// The card the note itself sits on. Port of
/// `lib/devices/note-card-background.ts`.
struct DeskNoteCardBackground: Identifiable, Hashable {
    let id: String
    let label: String
    let hint: String

    static let all: [DeskNoteCardBackground] = [
        .init(id: "match_theme", label: "Match desk style",
              hint: "Card picks up the colors for Cream, Blush, Plum, or Sage above."),
        .init(id: "light", label: "Light paper",
              hint: "Always warm light card with dark type — easiest to read in daylight."),
        .init(id: "dark", label: "Dark card",
              hint: "Dark panel with light text — good in dim rooms."),
    ]

    static func isValid(_ id: String) -> Bool { all.contains { $0.id == id } }

    static func label(_ id: String?) -> String {
        guard let id else { return "—" }
        return all.first { $0.id == id }?.label ?? id
    }
}
