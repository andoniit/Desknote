import SwiftUI

/// What a pulled-down DeskNote notification looks like.
///
/// The banner itself can only ever be two lines of text, so the nice part
/// lives here: the same warm paper the app and the desks are made of, a
/// sealed note waiting to be read, and not one word of what it says.
struct NoteArrivedCard: View {
    let headline: String
    var senderName: String?
    var deskName: String?
    var arrivedAt: Date

    @State private var settled = false

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Palette.cream50, Palette.blush50, Palette.rose50],
                startPoint: .topLeading, endPoint: .bottomTrailing)

            // Two soft washes of colour behind the note, so the paper sits
            // on something warm rather than on a flat fill.
            Circle()
                .fill(Palette.rose100.opacity(0.55))
                .frame(width: 260, height: 260)
                .blur(radius: 60)
                .offset(x: -110, y: -80)
            Circle()
                .fill(Palette.blush.opacity(0.45))
                .frame(width: 220, height: 220)
                .blur(radius: 55)
                .offset(x: 120, y: 90)

            note
                .padding(.horizontal, 18)
                .padding(.vertical, 16)
                .scaleEffect(settled ? 1 : 0.96)
                .opacity(settled ? 1 : 0)
        }
        .onAppear {
            withAnimation(.spring(response: 0.55, dampingFraction: 0.78)) { settled = true }
        }
    }

    private var note: some View {
        ZStack(alignment: .top) {
            // The sheet underneath, showing at a slight angle — the desk's
            // "there is more than one note here" look.
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(Color.white.opacity(0.55))
                .rotationEffect(.degrees(-3), anchor: .center)
                .offset(y: 9)
                .padding(.horizontal, 13)

            VStack(spacing: 0) {
                seal
                    .padding(.top, 22)
                    .padding(.bottom, 14)

                Text(headline)
                    .font(.display(21, weight: .semibold))
                    .foregroundStyle(Palette.ink)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 22)

                if let attribution {
                    Text(attribution)
                        .font(.system(size: 14))
                        .foregroundStyle(Palette.muted)
                        .multilineTextAlignment(.center)
                        .padding(.top, 7)
                        .padding(.horizontal, 22)
                }

                // A hint of the note without a word of it: three ruled
                // lines, the way the desk shows a card from across a room.
                VStack(spacing: 7) {
                    ruledLine(width: 0.82)
                    ruledLine(width: 0.66)
                    ruledLine(width: 0.44)
                }
                .padding(.top, 18)
                .padding(.horizontal, 34)

                footer
                    .padding(.top, 18)
                    .padding(.bottom, 20)
            }
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(Color.white.opacity(0.92)))
            .overlay(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(Palette.rose100.opacity(0.8), lineWidth: 1))
            .shadow(color: Palette.plum400.opacity(0.14), radius: 20, y: 10)
        }
    }

    /// The wax seal: a rose disc with a heart in it, the app's own mark.
    private var seal: some View {
        ZStack {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [Palette.rose200, Palette.rose300],
                        startPoint: .top, endPoint: .bottom))
                .frame(width: 46, height: 46)
                .shadow(color: Palette.rose300.opacity(0.45), radius: 10, y: 4)
            Image(systemName: "heart.fill")
                .font(.system(size: 19, weight: .medium))
                .foregroundStyle(Palette.cream)
        }
        .scaleEffect(settled ? 1 : 0.6)
        .animation(.spring(response: 0.6, dampingFraction: 0.6).delay(0.08), value: settled)
    }

    private func ruledLine(width: CGFloat) -> some View {
        Capsule()
            .fill(Palette.blush100)
            .frame(height: 7)
            .frame(maxWidth: .infinity, alignment: .center)
            .scaleEffect(x: width, y: 1, anchor: .center)
    }

    private var footer: some View {
        HStack(spacing: 6) {
            Image(systemName: "hand.tap")
                .font(.system(size: 11))
            Text("Open DeskNote to read it")
                .font(.system(size: 12, weight: .medium))
        }
        .foregroundStyle(Palette.faint)
    }

    /// "from Ani · on Ani's desk · just now", minus whichever parts the
    /// payload did not carry.
    private var attribution: String? {
        var parts: [String] = []
        if let senderName, !senderName.isEmpty { parts.append("from \(senderName)") }
        if let deskName, !deskName.isEmpty { parts.append("on \(deskName)") }
        parts.append(RelativeTime.short(arrivedAt))
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

#Preview {
    NoteArrivedCard(
        headline: "You have a message on your desk",
        senderName: "Ani",
        deskName: "the bedroom desk",
        arrivedAt: Date())
    .frame(height: 320)
}
