import SwiftUI

/// Both desks at a glance, under the greeting: a dot and a word each.
struct DeskStatusStrip: View {
    @Environment(DeskStore.self) private var store

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(store.devices) { device in
                    chip(device)
                }
            }
        }
    }

    private func chip(_ device: DeviceRow) -> some View {
        let online = device.online ?? false
        let whose = device.ownerID == store.userID ? "Yours" : device.name
        return HStack(spacing: 6) {
            Circle()
                .fill(online ? Palette.rose400 : Palette.plum200)
                .frame(width: 6, height: 6)
            Text(online ? "\(whose) · online" : "\(whose) · \(lastSeen(device))")
                .font(.system(size: 12))
                .foregroundStyle(Palette.plum400)
                .lineLimit(1)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Color.white.opacity(0.85))
        .clipShape(Capsule())
        .overlay(Capsule().stroke(Palette.rose100.opacity(0.8), lineWidth: 1))
        .accessibilityElement(children: .combine)
    }

    private func lastSeen(_ device: DeviceRow) -> String {
        device.lastSeenAt.map { "seen \(RelativeTime.short($0))" } ?? "offline"
    }
}
