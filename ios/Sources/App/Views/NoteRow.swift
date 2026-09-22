import SwiftUI

/// One note, as the Desk tab's "Recent" and the History tab both show it:
/// who → which desk and when, the words (or a lock for a secret), and a
/// single status chip.
struct NoteRow: View {
    let entry: MessageHistoryEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 5) {
                Text(entry.senderLabel)
                    .foregroundStyle(Palette.plum400)
                    .fontWeight(.medium)
                Image(systemName: "arrow.right")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(Palette.faint)
                Text(entry.deviceName)
                    .foregroundStyle(Palette.muted)
                    .lineLimit(1)
                Spacer(minLength: 4)
                Text(RelativeTime.short(entry.createdAt))
                    .foregroundStyle(Palette.faint)
            }
            .font(.system(size: 12))

            if entry.messageType == .secret {
                Label("Secret note", systemImage: "lock.fill")
                    .font(.system(size: 14).italic())
                    .foregroundStyle(Palette.plum300)
            } else {
                DeskText(content: entry.content, size: 15)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let chip {
                Text(chip.text)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(chip.strong ? Palette.rose400 : Palette.muted)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(chip.strong ? Palette.rose50 : Palette.cream200)
                    .clipShape(Capsule())
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color.white.opacity(0.8))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Palette.ash200.opacity(0.6), lineWidth: 1))
    }

    /// One chip, not three: "Seen" matters most; a little tap or a pinned
    /// note says so only when there is nothing more useful to say.
    private var chip: (text: String, strong: Bool)? {
        if entry.seenState == .seen { return ("Seen", true) }
        if entry.messageType == .quickSend { return ("Little tap", false) }
        if entry.isPinned { return ("Pinned", false) }
        return entry.seenState == .unseen ? ("Not seen yet", false) : nil
    }
}
