import Foundation

/// The desk's overall look. Port of `lib/devices/themes.ts` — the ids are
/// what lands in `devices.theme`, so the firmware reads the same strings.
struct DeskTheme: Identifiable, Hashable {
    let id: String
    let label: String
    let hint: String
    /// The desk's screen: the whole panel in `paper`, notes in `ink`. The
    /// theme picker draws exactly this pair so the choice is visible.
    let paper: UInt32
    let ink: UInt32

    static let all: [DeskTheme] = [
        // Keep in step with lib/devices/themes.ts and kThemes in the firmware.
        .init(id: "cream", label: "Cream", hint: "Warm paper and plum ink — the app's own look.",
              paper: 0xFDFAF6, ink: 0x4E353D),
        .init(id: "blush", label: "Blush", hint: "Rose-tinted paper, deep berry ink.",
              paper: 0xFBE8E4, ink: 0x5A2E36),
        .init(id: "sage", label: "Sage", hint: "Quiet green paper, forest ink.",
              paper: 0xEEF2EA, ink: 0x2F3B30),
        .init(id: "lavender", label: "Lavender", hint: "Soft lilac paper, deep violet ink.",
              paper: 0xEEEAF6, ink: 0x3C3452),
        .init(id: "sky", label: "Sky", hint: "Pale blue paper, navy ink.",
              paper: 0xE8F0F6, ink: 0x22384A),
        .init(id: "peach", label: "Peach", hint: "Warm apricot paper, brown ink.",
              paper: 0xFCEBDD, ink: 0x5A3522),
        .init(id: "plum", label: "Plum", hint: "Dark plum with blush text — easy on the eyes.",
              paper: 0x2A1C22, ink: 0xF4E6EA),
        .init(id: "midnight", label: "Midnight", hint: "Dark navy for a bedside desk at night.",
              paper: 0x141A2A, ink: 0xE8ECF5),
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
        .init(id: "lavender", label: "Lavender"),
        .init(id: "sky", label: "Sky"),
        .init(id: "peach", label: "Peach"),
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
        .init(id: "match_theme", label: "Match theme",
              hint: "Notes use the desk's theme."),
        .init(id: "light", label: "Always light",
              hint: "Notes on cream paper, whatever the theme — easiest in daylight."),
        .init(id: "dark", label: "Always dark",
              hint: "Notes on midnight — gentle in a dim room."),
    ]

    static func isValid(_ id: String) -> Bool { all.contains { $0.id == id } }

    static func label(_ id: String?) -> String {
        guard let id else { return "—" }
        return all.first { $0.id == id }?.label ?? id
    }
}
