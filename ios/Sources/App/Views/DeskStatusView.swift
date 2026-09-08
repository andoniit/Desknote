import SwiftUI

/// Live online / last-seen for every desk you can reach.
/// Port of `DashboardDeskStatus`.
struct DeskStatusView: View {
    @Environment(DeskStore.self) private var store

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionLabel(text: "Desks")

            if store.devices.isEmpty {
                EmptyState(
                    title: "No displays yet",
                    description: "Pair an ESP32 from Devices — live online status for each desk will show up here.")
            } else {
                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: 150), spacing: 12)],
                    spacing: 12
                ) {
                    ForEach(store.devices) { device in
                        card(device)
                    }
                }
            }
        }
    }

    private func card(_ device: DeviceRow) -> some View {
        let online = device.online ?? false
        return DeskCard(padding: 14) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(device.name)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(Palette.ink)
                            .lineLimit(1)
                        Text(store.ownerLabel(for: device, short: true).uppercased())
                            .font(.system(size: 10, weight: .medium))
                            .tracking(1)
                            .foregroundStyle(Palette.faint)
                    }
                    Spacer(minLength: 6)
                    Circle()
                        .fill(online ? Palette.rose400 : Palette.plum200)
                        .frame(width: 9, height: 9)
                        .overlay(
                            Circle()
                                .stroke(Palette.rose400.opacity(online ? 0.2 : 0), lineWidth: 4))
                        .accessibilityLabel(online ? "Online" : "Offline")
                }

                HStack(spacing: 5) {
                    Text(online ? "Online" : "Offline")
                        .foregroundStyle(online ? Palette.rose400 : Palette.muted)
                    Text("·").foregroundStyle(Palette.faint)
                    Text(device.lastSeenAt.map { RelativeTime.short($0) } ?? "never seen")
                        .foregroundStyle(Palette.muted)
                }
                .font(.system(size: 12))
            }
        }
    }
}
