import SwiftUI

/// Renders message text that may contain desk stickers.
///
/// Stickers are Material Design Icons codepoints in the supplementary
/// private use area — no system font has a glyph there, so a plain `Text`
/// shows empty boxes. The string is split into sticker and non-sticker
/// runs and each run gets the font it needs.
struct DeskText: View {
    let content: String
    var size: CGFloat = 15
    var weight: Font.Weight = .regular
    var color: Color = Palette.ink

    var body: some View {
        runs.reduce(Text("")) { partial, run in
            partial + Text(run.text)
                .font(run.isSticker ? .mdi(size) : .system(size: size, weight: weight))
        }
        .foregroundStyle(color)
    }

    private struct Run {
        let text: String
        let isSticker: Bool
    }

    private var runs: [Run] {
        var out: [Run] = []
        for character in content {
            // A character is a sticker when its first scalar sits in
            // plane 15, where MDI puts every glyph.
            let isSticker = character.unicodeScalars.first.map { $0.value >= 0xF_0000 } ?? false
            if let last = out.last, last.isSticker == isSticker {
                out[out.count - 1] = Run(text: last.text + String(character), isSticker: isSticker)
            } else {
                out.append(Run(text: String(character), isSticker: isSticker))
            }
        }
        return out
    }
}
