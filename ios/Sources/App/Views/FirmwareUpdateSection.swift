import SwiftUI

/// The Firmware part of a desk's settings: which version it runs, and the
/// button that asks it to update itself.
///
/// Nothing is installed from the phone. Pressing Update records the request;
/// the server pokes the desk over MQTT, and the desk downloads the signed
/// image, checks it, and restarts into it. Its progress comes back through
/// the same realtime channel as everything else on this screen.
struct FirmwareUpdateSection: View {
    @Environment(DeskStore.self) private var store
    let device: DeviceRow

    @State private var isRequesting = false
    @State private var error: String?

    /// How long a request may sit before it is worth suggesting the desk is
    /// off. A desk that is on hears the MQTT poke within seconds.
    private static let staleAfter: TimeInterval = 10 * 60

    private enum Phase {
        case unknown
        case needsUSB(current: String?)
        case working(target: String, downloading: Bool, since: Date?)
        case failed(reason: String, current: String?)
        case upToDate(current: String)
        case available(current: String?, latest: String)
    }

    private var phase: Phase {
        let current = device.firmwareVersion
        let latest = store.latestFirmware?.version

        if let target = device.otaTargetVersion,
           device.otaStatus == "requested" || device.otaStatus == "downloading" {
            return .working(
                target: target,
                downloading: device.otaStatus == "downloading",
                since: device.otaStatusAt)
        }
        if !device.canUpdateOverTheAir { return .needsUSB(current: current) }
        if device.otaStatus == "failed" {
            return .failed(reason: device.otaError ?? "The desk could not install it.", current: current)
        }
        if let latest, latest != current { return .available(current: current, latest: latest) }
        if let current { return .upToDate(current: current) }
        return .unknown
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: "Firmware")

            switch phase {
            case .unknown:
                line("This desk has not reported its version yet.")

            case .needsUSB(let current):
                line(current.map { "Running \($0)." } ?? "Version not reported yet.")
                Notice(
                    text: "This firmware predates over-the-air updates. Flash it over USB once — ./scripts/flash-desk.sh — and after that, updates come from here.",
                    tone: .info)

            case .working(let target, let downloading, let since):
                line(downloading
                     ? "Installing \(target)… keep the desk plugged in. It restarts when it's done."
                     : "Update to \(target) requested — the desk should start in a moment.")
                if let since, Date().timeIntervalSince(since) > Self.staleAfter {
                    Notice(
                        text: "Asked \(RelativeTime.short(since)) and not finished. Is the desk switched on and online? It picks this up as soon as it is.",
                        tone: .info)
                }

            case .failed(let reason, let current):
                line(current.map { "Still on \($0)." } ?? "")
                Notice(text: "The last update didn't install: \(reason).", tone: .danger)
                updateButton(label: "Try again")

            case .upToDate(let current):
                line("Up to date — \(current).")

            case .available(let current, let latest):
                line(current.map { "Running \($0). \(latest) is available." } ?? "\(latest) is available.")
                if let notes = store.latestFirmware?.notes, !notes.isEmpty {
                    Text(notes)
                        .font(.system(size: 11))
                        .foregroundStyle(Palette.faint)
                        .fixedSize(horizontal: false, vertical: true)
                }
                updateButton(label: "Update to \(latest)")
            }

            if let error { Notice(text: error, tone: .danger) }
        }
    }

    private func line(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 13))
            .foregroundStyle(Palette.muted)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func updateButton(label: String) -> some View {
        Button(isRequesting ? "Asking the desk…" : label, action: requestUpdate)
            .buttonStyle(SecondaryButtonStyle())
            .disabled(isRequesting)
    }

    private func requestUpdate() {
        error = nil
        isRequesting = true
        Task {
            defer { isRequesting = false }
            do {
                try await FirmwareAPI.requestUpdate(deviceID: device.id)
                await store.refresh()
            } catch let failure as DeskError {
                error = failure.message
            } catch {
                self.error = "Could not ask the desk to update. Please try again shortly."
            }
        }
    }
}
