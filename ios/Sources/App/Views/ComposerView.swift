import SwiftUI

/// Write a message, pick a desk, send. Port of `DashboardDeskComposer`.
struct ComposerView: View {
    @Environment(DeskStore.self) private var store

    @State private var body_ = ""
    @State private var isSecret = false
    @State private var selectedDeviceID: UUID?
    @State private var error: String?
    @State private var isSending = false
    @FocusState private var editorFocused: Bool

    var body: some View {
        if store.devices.isEmpty {
            EmptyState(
                title: "No desks to send to yet",
                description: "Pair a display under Devices — then you can aim messages at one desk or both at once.")
        } else {
            DeskCard(padding: 0) {
                PanelHeader(
                    title: "Write a message",
                    subtitle: "Saved to your history and queued for the desk displays.")
                    .padding(16)
                    .background(Palette.blush50.opacity(0.6))

                VStack(alignment: .leading, spacing: 0) {
                    editor
                    EmojiPickerView(
                        onPick: { sticker in
                            body_ = String((body_ + sticker).prefix(DeskMessageValidation.maxLength))
                        },
                        usedLength: body_.count,
                        maxLength: DeskMessageValidation.maxLength,
                        disabled: isSending)
                        .padding(.top, 12)

                    secretToggle.padding(.top, 16)
                    targets.padding(.top, 18)

                    if let error {
                        Notice(text: error, tone: .danger).padding(.top, 12)
                    }
                }
                .padding(16)
            }
            .onAppear {
                if selectedDeviceID == nil { selectedDeviceID = store.devices.first?.id }
            }
            .onChange(of: store.devices) { _, devices in
                // A desk can disappear under you when it is unpaired.
                if !devices.contains(where: { $0.id == selectedDeviceID }) {
                    selectedDeviceID = devices.first?.id
                }
            }
        }
    }

    private var editor: some View {
        ZStack(alignment: .topLeading) {
            if body_.isEmpty {
                Text("Something sweet, silly, or steady…")
                    .font(.system(size: 16))
                    .foregroundStyle(Palette.plum200)
                    .padding(.horizontal, 17)
                    .padding(.vertical, 20)
                    .allowsHitTesting(false)
            }
            TextEditor(text: $body_)
                .font(.system(size: 16))
                .foregroundStyle(Palette.ink)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 116)
                .focused($editorFocused)
                .padding(.horizontal, 12)
                .padding(.vertical, 12)
                .onChange(of: body_) { _, new in
                    if new.count > DeskMessageValidation.maxLength {
                        body_ = String(new.prefix(DeskMessageValidation.maxLength))
                    }
                }
        }
        .background(Color.white.opacity(0.85))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(editorFocused ? Palette.rose200 : Palette.ash200.opacity(0.7), lineWidth: 1))
        .disabled(isSending)
    }

    private var secretToggle: some View {
        Button {
            isSecret.toggle()
        } label: {
            HStack(alignment: .top, spacing: 11) {
                Image(systemName: isSecret ? "checkmark.square.fill" : "square")
                    .font(.system(size: 18))
                    .foregroundStyle(isSecret ? Palette.plum400 : Palette.plum200)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Send as a secret note")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Palette.ink)
                    Text("Arrives hidden on the desk — tap to reveal, tap again and it’s gone forever.")
                        .font(.system(size: 12))
                        .foregroundStyle(Palette.faint)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .padding(12)
            .background(isSecret ? Palette.plum500.opacity(0.05) : Color.white.opacity(0.6))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(isSecret ? Palette.plum300 : Palette.ash200.opacity(0.7), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .disabled(isSending)
    }

    private var targets: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                SectionLabel(text: "Send to one desk")
                Picker("Desk", selection: $selectedDeviceID) {
                    ForEach(store.devices) { device in
                        Text("\(device.name) — \(store.ownerLabel(for: device))")
                            .tag(Optional(device.id))
                    }
                }
                .pickerStyle(.menu)
                .tint(Palette.plum500)
                .frame(maxWidth: .infinity, alignment: .leading)
                .deskFieldChrome()
            }

            Button(isSending ? "Sending…" : "Send to selected desk") {
                guard let selectedDeviceID else { return }
                send(to: [selectedDeviceID])
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(isSending || trimmed.isEmpty || selectedDeviceID == nil)

            Button("Send to both desks") {
                send(to: store.devices.map(\.id))
            }
            .buttonStyle(SecondaryButtonStyle())
            .disabled(isSending || trimmed.isEmpty || store.devices.count < 2)

            if !store.isLinked && store.devices.count == 1 {
                Text("Link with your partner on the Pair tab to add a second desk here.")
                    .font(.system(size: 12))
                    .foregroundStyle(Palette.faint)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var trimmed: String {
        body_.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func send(to deviceIDs: [UUID]) {
        guard !trimmed.isEmpty else { return }
        error = nil
        editorFocused = false
        isSending = true

        Task {
            defer { isSending = false }
            do {
                try await store.send(
                    content: trimmed,
                    toDeviceIDs: deviceIDs,
                    messageType: isSecret ? .secret : .standard)
                body_ = ""
                isSecret = false
            } catch let failure as DeskError {
                error = failure.message
            } catch {
                self.error = "Something went wrong while sending. Please try again."
            }
        }
    }
}
