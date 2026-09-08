import SwiftUI

/// Little taps: pick where it goes, then tap a preset — off it flies.
/// Port of `QuickSendPresets`.
struct QuickSendView: View {
    @Environment(DeskStore.self) private var store

    @State private var target: QuickSendTarget = .myDesk
    @State private var sendingID: String?
    @State private var error: String?

    var body: some View {
        let targets = store.availableQuickSendTargets

        if !targets.isEmpty {
            DeskCard(padding: 0) {
                PanelHeader(
                    title: "Little taps",
                    subtitle: "Pick where it goes, then tap — off it flies.")
                    .padding(16)
                    .background(Palette.blush50.opacity(0.6))

                VStack(alignment: .leading, spacing: 12) {
                    SectionLabel(text: "Send to")

                    HStack(spacing: 6) {
                        ForEach(targets, id: \.target) { option in
                            targetChip(option.target, label: option.label)
                        }
                    }

                    presets

                    if let error {
                        Notice(text: error, tone: .danger)
                    }
                }
                .padding(16)
            }
            .onAppear { snapTarget(to: targets) }
            .onChange(of: store.devices) { _, _ in
                snapTarget(to: store.availableQuickSendTargets)
            }
        }
    }

    /// When the desk lineup changes — someone unpairs, a partner joins —
    /// fall back to the first target that still exists.
    private func snapTarget(to targets: [(target: QuickSendTarget, label: String)]) {
        guard let first = targets.first else { return }
        if !targets.contains(where: { $0.target == target }) { target = first.target }
    }

    private func targetChip(_ option: QuickSendTarget, label: String) -> some View {
        let selected = option == target
        return Button {
            target = option
        } label: {
            HStack(spacing: 4) {
                if !option.sticker.isEmpty {
                    Text(option.sticker).font(.mdi(15))
                }
                Text(label).lineLimit(1).font(.system(size: 12, weight: .medium))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .foregroundStyle(selected ? Palette.cream : Palette.plum400)
            .background(selected ? Palette.plum500 : Color.white.opacity(0.8))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(selected ? .clear : Palette.plum100.opacity(0.6), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private var presets: some View {
        LazyVGrid(
            columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)],
            spacing: 8
        ) {
            ForEach(QuickSendPreset.all) { preset in
                Button {
                    send(preset)
                } label: {
                    DeskText(content: preset.text, size: 14, weight: .medium, color: Palette.plum500)
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(Color.white.opacity(0.9))
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .stroke(Palette.rose100.opacity(0.7), lineWidth: 1))
                        .opacity(sendingID == preset.id ? 0.55 : 1)
                }
                .buttonStyle(.plain)
                .disabled(sendingID != nil)
            }
        }
    }

    private func send(_ preset: QuickSendPreset) {
        error = nil
        do {
            let deviceIDs = try store.deviceIDs(for: target)
            sendingID = preset.id
            Task {
                defer { sendingID = nil }
                do {
                    try await store.send(
                        content: preset.text,
                        toDeviceIDs: deviceIDs,
                        messageType: .quickSend)
                } catch let failure as DeskError {
                    error = failure.message
                } catch {
                    self.error = "Something went wrong while sending. Please try again."
                }
            }
        } catch let failure as DeskError {
            error = failure.message
        } catch {
            self.error = "Something went wrong. Please try again."
        }
    }
}
