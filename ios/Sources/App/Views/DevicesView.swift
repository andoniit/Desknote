import SwiftUI

/// The Desks tab: both desks as rows — tap one to see or change it — and a
/// way to pair another.
struct DevicesView: View {
    @Environment(DeskStore.self) private var store
    @State private var isPairing = false
    @State private var openDeskID: UUID?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if store.devices.isEmpty {
                        EmptyState(
                            title: "No desks yet",
                            description: "Plug in a DeskNote display — it shows a six-digit code to pair with.")
                    } else {
                        ForEach(store.devices) { device in
                            Button { openDeskID = device.id } label: {
                                DeskListRow(device: device)
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    Button {
                        isPairing = true
                    } label: {
                        Label("Pair a desk", systemImage: "plus")
                    }
                    .buttonStyle(SecondaryButtonStyle())
                    .padding(.top, 4)

                    wifiHelp.padding(.top, 14)
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 32)
            }
            .refreshable { await store.refresh() }
            .deskBackground()
            .navigationTitle("Desks")
            .sheet(isPresented: $isPairing) { PairDeskSheet() }
            .sheet(item: $openDeskID) { id in
                DeskDetailSheet(deviceID: id)
            }
        }
    }

    private var wifiHelp: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "wifi")
                .font(.system(size: 13))
                .foregroundStyle(Palette.plum300)
                .padding(.top, 2)
            Text("Moving a desk to new Wi-Fi? If it can't connect, it lists the networks nearby — pick yours and type the password on its screen.")
                .font(.system(size: 12))
                .foregroundStyle(Palette.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 4)
    }
}

extension UUID: @retroactive Identifiable {
    public var id: UUID { self }
}

/// One desk in the list: its paper as a swatch, name and room, whether it
/// is awake, and a word on its firmware.
private struct DeskListRow: View {
    @Environment(DeskStore.self) private var store
    let device: DeviceRow

    var body: some View {
        let online = device.online ?? false
        let theme = DeskTheme.all.first { $0.id == device.theme } ?? DeskTheme.all[0]
        HStack(spacing: 14) {
            Text("Aa")
                .font(.display(17))
                .foregroundStyle(Color(hex: theme.ink))
                .frame(width: 48, height: 48)
                .background(Color(hex: theme.paper))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(Palette.ash200, lineWidth: 1))

            VStack(alignment: .leading, spacing: 3) {
                Text(device.name)
                    .font(.display(18))
                    .foregroundStyle(Palette.ink)
                    .lineLimit(1)
                Text(subtitle)
                    .font(.system(size: 12))
                    .foregroundStyle(Palette.muted)
                    .lineLimit(1)
            }
            Spacer(minLength: 6)
            VStack(alignment: .trailing, spacing: 3) {
                HStack(spacing: 5) {
                    Circle()
                        .fill(online ? Palette.rose400 : Palette.plum200)
                        .frame(width: 7, height: 7)
                    Text(online ? "Online" : "Offline")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(online ? Palette.rose400 : Palette.muted)
                }
                if updateAvailable {
                    Text("Update")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(Palette.cream)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 2)
                        .background(Palette.rose400)
                        .clipShape(Capsule())
                }
            }
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Palette.faint)
        }
        .padding(14)
        .background(Color.white.opacity(0.85))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Palette.ash200.opacity(0.7), lineWidth: 1))
        .contentShape(Rectangle())
    }

    private var subtitle: String {
        var parts = [store.ownerLabel(for: device, short: true)]
        if let room = device.locationName, !room.isEmpty { parts.append(room) }
        if let fw = device.firmwareVersion { parts.append(fw) }
        return parts.joined(separator: " · ")
    }

    private var updateAvailable: Bool {
        guard device.ownerID == store.userID, device.canUpdateOverTheAir,
              let latest = store.latestFirmware?.version else { return false }
        return latest != device.firmwareVersion && device.otaTargetVersion == nil
    }
}
