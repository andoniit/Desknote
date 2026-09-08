import Foundation

/// One-tap messages for the quick-send strip. Kept identical to
/// `lib/messages/quick-presets.ts` so a tap on the phone and a tap on the
/// web store the exact same text.
struct QuickSendPreset: Identifiable, Hashable {
    let id: String
    let text: String

    static let all: [QuickSendPreset] = {
        let heart = DeskStickers.char(named: "heart")
        let sun = DeskStickers.char(named: "sun")
        return [
            .init(id: "good-morning", text: "Good morning" + (heart.isEmpty ? "" : " \(heart)")),
            .init(id: "miss-you", text: "Miss you"),
            .init(id: "eat-lunch", text: "Eat lunch"),
            .init(id: "drink-water", text: "Drink water"),
            .init(id: "call-free", text: "Call me when free"),
            .init(id: "good-luck", text: "Good luck today" + (sun.isEmpty ? "" : " \(sun)")),
        ]
    }()
}

/// Which desks a quick tap goes to.
enum QuickSendTarget: String, Identifiable, Hashable {
    case myDesk = "my_desk"
    case theirDesk = "her_desk"
    case both

    var id: String { rawValue }

    /// Sticker shown on the target chip — same three glyphs as the web.
    var sticker: String {
        switch self {
        case .myDesk: return DeskStickers.char(named: "heart")
        case .theirDesk: return DeskStickers.char(named: "hug")
        case .both: return DeskStickers.char(named: "sun")
        }
    }
}
