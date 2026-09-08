import SwiftUI

/// Every desk you can reach, plus the form that claims a new one.
/// Port of the web `/devices` page.
struct DevicesView: View {
    @Environment(DeskStore.self) private var store

    @State private var isPairing = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    PageHeader(
                        eyebrow: "Devices",
                        description: "Pair each ESP32 once, give it a name and a corner of your home, then watch when it was last awake."
                    ) {
                        Text("Two desks, ")
                            + Text("one conversation").italic().foregroundColor(Palette.rose300)
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        SectionLabel(text: "Your desks")

                        if store.devices.isEmpty {
                            EmptyState(
                                title: "No desks paired yet",
                                description: "When you claim a display with its six-digit code, it will show up here with live status.")
                        } else {
                            ForEach(store.devices) { device in
                                DeviceRowCard(device: device)
                            }
                        }
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        SectionLabel(text: "Wi-Fi")
                        DeskCard(padding: 16) {
                            Text("Setting the desk’s network is a USB job — plug it into a computer and open the Wi-Fi page in the web app, or use the Arduino Serial Monitor fallback there.")
                                .font(.system(size: 13))
                                .foregroundStyle(Palette.muted)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }

                    Button("Pair a new desk") { isPairing = true }
                        .buttonStyle(PrimaryButtonStyle())
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 40)
            }
            .refreshable { await store.refresh() }
            .deskBackground()
            .navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $isPairing) { PairDeskSheet() }
        }
    }
}

/// One desk: who owns it, whether it is awake, and how it is dressed.
private struct DeviceRowCard: View {
    @Environment(DeskStore.self) private var store
    let device: DeviceRow

    var body: some View {
        let online = device.online ?? false

        DeskCard(padding: 16) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(device.name)
                            .font(.display(17, weight: .semibold))
                            .foregroundStyle(Palette.ink)
                        Text(device.locationName ?? store.ownerLabel(for: device))
                            .font(.system(size: 12))
                            .foregroundStyle(Palette.muted)
                    }
                    Spacer(minLength: 8)
                    HStack(spacing: 6) {
                        Circle()
                            .fill(online ? Palette.rose400 : Palette.plum200)
                            .frame(width: 8, height: 8)
                        Text(online ? "Online" : "Offline")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(online ? Palette.rose400 : Palette.muted)
                    }
                }

                Divider().overlay(Palette.ash200.opacity(0.7))

                VStack(spacing: 6) {
                    detail("Last seen", device.lastSeenAt.map { RelativeTime.short($0) } ?? "never")
                    detail("Theme", DeskTheme.label(device.theme))
                    detail("Accent", DeskAccent.label(device.accentColor))
                    detail("Message card", DeskNoteCardBackground.label(device.noteCardBackground))
                    detail("Firmware", device.firmwareVersion ?? "—")
                }
            }
        }
    }

    private func detail(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 12))
                .foregroundStyle(Palette.faint)
            Spacer()
            Text(value)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Palette.plum400)
        }
    }
}
