import SwiftUI

/// Desk stickers grouped by category: tap a chip to switch, stickers lay
/// out in a wrapped grid below — no sideways hunting through one long row.
/// Port of `EmojiPickerPanel`.
struct EmojiPickerView: View {
    let onPick: (String) -> Void
    let usedLength: Int
    let maxLength: Int
    var disabled = false

    @State private var activeCategory = DeskStickers.byCategory.first?.id ?? "love"

    private let columns = [GridItem(.adaptive(minimum: 56, maximum: 72), spacing: 6)]

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                SectionLabel(text: "Desk stickers")
                Spacer()
                Text("\(usedLength)/\(maxLength)")
                    .font(.system(size: 12).monospacedDigit())
                    .foregroundStyle(Palette.faint)
            }

            VStack(spacing: 0) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 5) {
                        ForEach(DeskStickers.byCategory, id: \.id) { category in
                            categoryChip(id: category.id, label: category.label)
                        }
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 7)
                }
                .background(Palette.rose50.opacity(0.8))

                Divider().overlay(Palette.rose100)

                LazyVGrid(columns: columns, spacing: 6) {
                    ForEach(stickers) { sticker in
                        stickerButton(sticker)
                    }
                }
                .padding(8)
            }
            .background(Palette.rose50.opacity(0.45))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Palette.rose100, lineWidth: 1))
            .opacity(disabled ? 0.5 : 1)
            .allowsHitTesting(!disabled)
        }
    }

    private var stickers: [DeskSticker] {
        DeskStickers.byCategory.first { $0.id == activeCategory }?.stickers ?? []
    }

    private func categoryChip(id: String, label: String) -> some View {
        let selected = id == activeCategory
        return Button(label) { activeCategory = id }
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(selected ? .white : Palette.muted)
            .padding(.horizontal, 12)
            .padding(.vertical, 5)
            .background(selected ? Palette.rose300.opacity(0.9) : Color.white.opacity(0.7))
            .clipShape(Capsule())
            .buttonStyle(.plain)
    }

    private func stickerButton(_ sticker: DeskSticker) -> some View {
        Button {
            onPick(sticker.char)
        } label: {
            VStack(spacing: 2) {
                Text(sticker.char)
                    .font(sticker.mdi ? .mdi(21) : .system(size: 21))
                    .foregroundStyle(Palette.ink)
                Text(sticker.name.uppercased())
                    .font(.system(size: 8, weight: .medium))
                    .tracking(0.5)
                    .foregroundStyle(Palette.muted)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .background(Color.white.opacity(0.7))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Palette.rose100.opacity(0.7), lineWidth: 1))
            .overlay(alignment: .topTrailing) {
                // The desk animates this one — same ✦ marker the web uses.
                if sticker.animated {
                    Text("✦")
                        .font(.system(size: 8))
                        .foregroundStyle(Palette.rose200)
                        .padding(.top, 3)
                        .padding(.trailing, 4)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(sticker.animated ? "\(sticker.name), animates on the desk" : sticker.name)
    }
}
