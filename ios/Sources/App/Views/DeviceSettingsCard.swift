import SwiftUI

/// Name, place, look, and the pin-by-default switch for one desk you own.
/// Port of `DeviceSettingsForm`.
struct DeviceSettingsCard: View {
    @Environment(DeskStore.self) private var store
    let device: DeviceRow

    @State private var name = ""
    @State private var location = ""
    @State private var theme = "cream"
    @State private var accent = "rose"
    @State private var noteCardBackground = "match_theme"
    @State private var pinnedByDefault = false

    @State private var message: String?
    @State private var error: String?
    @State private var isSaving = false
    @State private var confirmingUnpair = false

    var body: some View {
        DeskCard(padding: 18) {
            VStack(alignment: .leading, spacing: 14) {
                PanelHeader(
                    title: device.name,
                    subtitle: device.locationName ?? "No room set")

                labelled("Desk name") {
                    TextField("Desk name", text: $name).deskFieldChrome()
                }

                labelled("Room or place") {
                    TextField("Optional", text: $location).deskFieldChrome()
                }

                labelled("Theme", hint: DeskTheme.all.first { $0.id == theme }?.hint) {
                    Picker("Theme", selection: $theme) {
                        ForEach(DeskTheme.all) { Text($0.label).tag($0.id) }
                    }
                    .pickerStyle(.menu)
                    .tint(Palette.plum500)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .deskFieldChrome()
                }

                labelled("Accent") {
                    HStack(spacing: 8) {
                        ForEach(DeskAccent.all) { option in
                            Button {
                                accent = option.id
                            } label: {
                                Circle()
                                    .fill(Palette.accent(option.id))
                                    .frame(width: 26, height: 26)
                                    .overlay(
                                        Circle().stroke(
                                            accent == option.id ? Palette.plum500 : Palette.ash200,
                                            lineWidth: accent == option.id ? 2 : 1))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(option.label)
                        }
                        Spacer()
                    }
                }

                labelled(
                    "Message card",
                    hint: DeskNoteCardBackground.all.first { $0.id == noteCardBackground }?.hint
                ) {
                    Picker("Message card", selection: $noteCardBackground) {
                        ForEach(DeskNoteCardBackground.all) { Text($0.label).tag($0.id) }
                    }
                    .pickerStyle(.menu)
                    .tint(Palette.plum500)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .deskFieldChrome()
                }

                Toggle(isOn: $pinnedByDefault) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Pin new messages by default")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(Palette.ink)
                        Text("Messages sent to this desk stay on screen until the next one arrives.")
                            .font(.system(size: 11))
                            .foregroundStyle(Palette.faint)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .tint(Palette.rose300)

                if let error { Notice(text: error, tone: .danger) }
                if let message { Notice(text: message, tone: .success) }

                Button(isSaving ? "Saving…" : "Save desk settings", action: save)
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(isSaving)

                Button("Unpair this desk") { confirmingUnpair = true }
                    .buttonStyle(SecondaryButtonStyle())
                    .disabled(isSaving)
                    .confirmationDialog(
                        "Unpair \(device.name)?",
                        isPresented: $confirmingUnpair,
                        titleVisibility: .visible
                    ) {
                        Button("Unpair", role: .destructive, action: unpair)
                        Button("Keep it paired", role: .cancel) {}
                    } message: {
                        Text("The display goes back to showing a fresh six-digit code, and neither of you will see it here until someone claims it again.")
                    }
            }
        }
        .onAppear(perform: loadDraft)
        .onChange(of: device) { _, _ in loadDraft() }
    }

    /// The card edits a local copy so a realtime refresh mid-edit does not
    /// yank the fields out from under the keyboard.
    private func loadDraft() {
        name = device.name
        location = device.locationName ?? ""
        theme = DeskTheme.isValid(device.theme ?? "") ? device.theme! : "cream"
        accent = DeskAccent.isValid(device.accentColor ?? "") ? device.accentColor! : "rose"
        noteCardBackground = DeskNoteCardBackground.isValid(device.noteCardBackground ?? "")
            ? device.noteCardBackground! : "match_theme"
        pinnedByDefault = device.pinnedModeEnabled ?? false
    }

    private func labelled<Content: View>(
        _ label: String,
        hint: String? = nil,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            SectionLabel(text: label)
            content()
            if let hint, !hint.isEmpty {
                Text(hint)
                    .font(.system(size: 11))
                    .foregroundStyle(Palette.faint)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func save() {
        guard let viewerID = store.userID else { return }
        error = nil
        message = nil
        isSaving = true
        Task {
            defer { isSaving = false }
            do {
                message = try await DevicesAPI.updateSettings(
                    deviceID: device.id,
                    ownerID: device.ownerID,
                    viewerID: viewerID,
                    name: name,
                    location: location,
                    theme: theme,
                    accent: accent,
                    noteCardBackground: noteCardBackground,
                    pinnedModeEnabled: pinnedByDefault)
                await store.refresh()
            } catch let failure as DeskError {
                error = failure.message
            } catch {
                self.error = "Something went wrong while saving. Please try again shortly."
            }
        }
    }

    private func unpair() {
        guard let viewerID = store.userID else { return }
        error = nil
        message = nil
        isSaving = true
        Task {
            defer { isSaving = false }
            do {
                message = try await DevicesAPI.unpair(
                    deviceID: device.id, ownerID: device.ownerID, viewerID: viewerID)
                await store.refresh()
            } catch let failure as DeskError {
                error = failure.message
            } catch {
                self.error = "Something went wrong while unpairing. Please try again shortly."
            }
        }
    }
}
