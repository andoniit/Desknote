import SwiftUI

/// Write a note and send it — everything on one card, Send always in view.
///
/// Where it goes is the shared destination above (their desk, mine, both).
/// Stickers open in a sheet rather than filling the card, and "secret" is a
/// single toggle that explains itself only once it is on.
struct ComposerView: View {
    @Environment(DeskStore.self) private var store
    @Binding var destination: QuickSendTarget

    @State private var text = ""
    @State private var isSecret = false
    @State private var isSending = false
    @State private var showStickers = false
    @State private var error: String?
    @State private var sentCount = 0
    @FocusState private var editorFocused: Bool

    private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var canSend: Bool { !trimmed.isEmpty && !isSending }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            let choices = store.destinationChoices
            if choices.count > 1 {
                DestinationPicker(choices: choices, selection: $destination)
            }

            editor

            if isSecret {
                Label("Hidden on the desk until tapped — then gone for good.", systemImage: "lock.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(Palette.plum300)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }

            HStack(spacing: 8) {
                roundButton(
                    systemImage: "face.smiling",
                    active: false,
                    label: "Add a sticker"
                ) { showStickers = true }

                roundButton(
                    systemImage: isSecret ? "lock.fill" : "lock.open",
                    active: isSecret,
                    label: isSecret ? "Secret note on" : "Make it a secret note"
                ) {
                    withAnimation(.snappy(duration: 0.2)) { isSecret.toggle() }
                }

                Text("\(text.count)/\(DeskMessageValidation.maxLength)")
                    .font(.system(size: 11).monospacedDigit())
                    .foregroundStyle(text.count > DeskMessageValidation.maxLength - 20 ? Palette.rose400 : Palette.faint)

                Spacer(minLength: 0)

                Button(action: send) {
                    HStack(spacing: 6) {
                        if isSending {
                            ProgressView().controlSize(.small).tint(Palette.cream)
                        }
                        Text(isSending ? "Sending" : "Send")
                        if !isSending {
                            Image(systemName: "paperplane.fill").font(.system(size: 12))
                        }
                    }
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Palette.cream)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 11)
                    .background(canSend ? Palette.plum500 : Palette.plum200)
                    .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .disabled(!canSend)
                .sensoryFeedback(.success, trigger: sentCount)
            }

            if let error { Notice(text: error, tone: .danger) }
        }
        .padding(14)
        .background(Color.white.opacity(0.88))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(Palette.ash200.opacity(0.7), lineWidth: 1))
        .shadow(color: Palette.plum400.opacity(0.07), radius: 16, y: 6)
        .sheet(isPresented: $showStickers) { stickerSheet }
        .onAppear { snapDestination() }
        .onChange(of: store.devices) { _, _ in snapDestination() }
    }

    private var editor: some View {
        ZStack(alignment: .topLeading) {
            if text.isEmpty {
                Text("Something sweet, silly, or steady…")
                    .font(.system(size: 17))
                    .foregroundStyle(Palette.plum200)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 8)
                    .allowsHitTesting(false)
            }
            TextEditor(text: $text)
                .font(.system(size: 17))
                .foregroundStyle(Palette.ink)
                .tint(Palette.plum500)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 92, maxHeight: 180)
                .focused($editorFocused)
                .onChange(of: text) { _, new in
                    if new.count > DeskMessageValidation.maxLength {
                        text = String(new.prefix(DeskMessageValidation.maxLength))
                    }
                }
        }
        .disabled(isSending)
    }

    private func roundButton(
        systemImage: String, active: Bool, label: String, action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(active ? Palette.cream : Palette.plum400)
                .frame(width: 38, height: 38)
                .background(active ? Palette.plum400 : Palette.blush50)
                .clipShape(Circle())
        }
        .buttonStyle(.plain)
        .disabled(isSending)
        .accessibilityLabel(label)
    }

    private var stickerSheet: some View {
        NavigationStack {
            ScrollView {
                EmojiPickerView(
                    onPick: { sticker in
                        text = String((text + sticker).prefix(DeskMessageValidation.maxLength))
                    },
                    usedLength: text.count,
                    maxLength: DeskMessageValidation.maxLength,
                    disabled: isSending)
                    .padding(16)
            }
            .deskBackground()
            .navigationTitle("Stickers")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { showStickers = false }
                        .fontWeight(.semibold)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private func snapDestination() {
        let choices = store.destinationChoices
        if !choices.contains(where: { $0.target == destination }), let first = choices.first {
            destination = first.target
        }
    }

    private func send() {
        guard canSend else { return }
        error = nil
        editorFocused = false
        isSending = true
        Task {
            defer { isSending = false }
            do {
                let deviceIDs = try store.deviceIDs(for: destination)
                try await store.send(
                    content: trimmed,
                    toDeviceIDs: deviceIDs,
                    messageType: isSecret ? .secret : .standard)
                text = ""
                isSecret = false
                sentCount += 1
            } catch let failure as DeskError {
                error = failure.message
            } catch {
                self.error = "That didn't send. Try again in a moment."
            }
        }
    }
}
