import Foundation

/// One desk sticker. The set is generated from the firmware's `kEmoji`
/// table (via `scripts/gen_emoji_assets.py` → `lib/emoji/supported.gen.ts`
/// → `Resources/emoji.json`), so the picker can only offer glyphs the
/// desk is actually able to draw.
struct DeskSticker: Decodable, Identifiable, Hashable {
    let char: String
    let cp: String
    let name: String
    /// Lives in the Material Design Icons private use area, so it needs
    /// the bundled MDI font to render as anything but a blank box.
    let mdi: Bool
    /// The desk animates this one (pulse / wiggle / bounce).
    let animated: Bool
    let category: String

    var id: String { cp }
}

enum DeskStickers {
    /// Display order and labels for the category ids the generator emits.
    /// Anything with an unknown category falls into "Fun" rather than
    /// vanishing from the picker.
    static let categories: [(id: String, label: String)] = [
        ("love", "Love"),
        ("spicy", "Spicy"),
        ("faces", "Faces"),
        ("animals", "Animals"),
        ("nature", "Nature"),
        ("food", "Food"),
        ("fun", "Fun"),
        ("everyday", "Everyday"),
    ]

    static let all: [DeskSticker] = {
        guard let url = Bundle.main.url(forResource: "emoji", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let rows = try? JSONDecoder().decode([DeskSticker].self, from: data)
        else {
            assertionFailure("emoji.json missing or malformed")
            return []
        }
        return rows
    }()

    /// Stickers per category, de-duplicated by glyph and in generator order.
    static let byCategory: [(id: String, label: String, stickers: [DeskSticker])] = {
        var seen = Set<String>()
        var buckets: [String: [DeskSticker]] = [:]
        for sticker in all where !seen.contains(sticker.char) {
            seen.insert(sticker.char)
            let known = categories.contains { $0.id == sticker.category }
            buckets[known ? sticker.category : "fun", default: []].append(sticker)
        }
        return categories.compactMap { category in
            guard let list = buckets[category.id], !list.isEmpty else { return nil }
            return (category.id, category.label, list)
        }
    }()

    /// The glyph for a sticker name, or "" when the firmware set does not
    /// carry it. Port of `lib/emoji/desk-sticker.ts`.
    static func char(named name: String) -> String {
        all.first { $0.name == name }?.char ?? ""
    }
}
