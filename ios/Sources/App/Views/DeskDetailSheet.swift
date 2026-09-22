import SwiftUI

/// Everything about one desk, in one place. For your own desk: theme,
/// accent, name, room, card style, pinning, firmware, unpair — the look
/// saves the moment you tap it, so the desk repaints while you watch. Your
/// partner's desk is shown read-only; only its owner can change it.
struct DeskDetailSheet: View {
    @Environment(DeskStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let deviceID: UUID

    @State private var name = ""
    @State private var location = ""
    @State private var error: String?
    @State private var savedNote: String?
    @State private var isSaving = false
    @State private var confirmingUnpair = false
    @State private var loaded = false
    // What was just tapped, shown straight away; the store catches up after
    // the write and a reload, which takes a second or two.
    @State private var draftTheme: String?
    @State private var draftAccent: String?
    @State private var draftCard: String?
    @State private var draftPinned: Bool?

    private var device: DeviceRow? { store.devices.first { $0.id == deviceID } }
    private var isMine: Bool { device?.ownerID == store.userID }

    var body: some View {
        NavigationStack {
            Group {
                if let device {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 22) {
                            header(device)
                            if isMine {
                                themeSection(device)
                                accentSection(device)
                                detailsSection(device)
                                DeskCard(padding: 16) { FirmwareUpdateSection(device: device) }
                                unpairButton(device)
                            } else {
                                Notice(
                                    text: "This is \(store.partnerLabel)'s desk — only they can change its look.",
                                    tone: .info)
                                readOnlySection(device)
                            }
                        }
                        .padding(20)
                    }
                } else {
                    EmptyState(title: "This desk is gone", description: "It may have been unpaired.")
                        .padding(20)
                }
            }
            .deskBackground()
            .navigationTitle(device?.name ?? "Desk")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        Task {
                            await saveTextIfChanged()
                            dismiss()
                        }
                    }
                    .fontWeight(.semibold)
                }
            }
            .onAppear(perform: loadDraft)
        }
        .presentationDragIndicator(.visible)
    }

    // MARK: - Sections

    private func header(_ device: DeviceRow) -> some View {
        let online = device.online ?? false
        return VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Circle().fill(online ? Palette.rose400 : Palette.plum200).frame(width: 7, height: 7)
                Text(online ? "Online" : lastSeen(device))
                    .foregroundStyle(online ? Palette.rose400 : Palette.muted)
                    .fontWeight(.medium)
                if let room = device.locationName, !room.isEmpty {
                    Text("· \(room)").foregroundStyle(Palette.muted)
                }
            }
            .font(.system(size: 13))
            if let savedNote {
                Label(savedNote, systemImage: "checkmark.circle.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(Palette.plum300)
                    .transition(.opacity)
            }
            if let error { Notice(text: error, tone: .danger).padding(.top, 6) }
        }
    }

    private func themeSection(_ device: DeviceRow) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Theme")
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 4), spacing: 12) {
                ForEach(DeskTheme.all) { theme in
                    let selected = currentTheme(device) == theme.id
                    Button {
                        save(theme: theme.id)
                    } label: {
                        VStack(spacing: 5) {
                            Text("Aa")
                                .font(.display(18))
                                .foregroundStyle(Color(hex: theme.ink))
                                .frame(maxWidth: .infinity)
                                .frame(height: 52)
                                .background(Color(hex: theme.paper))
                                .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 13, style: .continuous)
                                        .stroke(selected ? Palette.ink : Palette.ash200,
                                                lineWidth: selected ? 2 : 1))
                            Text(theme.label)
                                .font(.system(size: 11, weight: selected ? .semibold : .regular))
                                .foregroundStyle(selected ? Palette.ink : Palette.muted)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(theme.label) theme")
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
            }
        }
    }

    private func accentSection(_ device: DeviceRow) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Accent")
            HStack(spacing: 0) {
                ForEach(DeskAccent.all) { accent in
                    let selected = currentAccent(device) == accent.id
                    Button {
                        save(accent: accent.id)
                    } label: {
                        Circle()
                            .fill(Palette.accent(accent.id))
                            .frame(width: 28, height: 28)
                            .padding(3)
                            .overlay(Circle().stroke(selected ? Palette.ink : .clear, lineWidth: 2))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(accent.label) accent")
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
            }
            Text("Colours the heart, stickers and progress bar on the desk.")
                .font(.system(size: 11))
                .foregroundStyle(Palette.faint)
        }
    }

    private func detailsSection(_ device: DeviceRow) -> some View {
        VStack(spacing: 0) {
            fieldRow("Name") {
                TextField("Desk name", text: $name)
                    .multilineTextAlignment(.trailing)
                    .submitLabel(.done)
                    .onSubmit { Task { await saveTextIfChanged() } }
            }
            divider
            fieldRow("Room") {
                TextField("Optional", text: $location)
                    .multilineTextAlignment(.trailing)
                    .submitLabel(.done)
                    .onSubmit { Task { await saveTextIfChanged() } }
            }
            divider
            fieldRow("Notes appear") {
                Picker("Notes appear", selection: Binding(
                    get: { currentCard(device) },
                    set: { save(card: $0) })
                ) {
                    ForEach(DeskNoteCardBackground.all) { Text($0.label).tag($0.id) }
                }
                .pickerStyle(.menu)
                .tint(Palette.plum400)
            }
            divider
            Toggle(isOn: Binding(
                get: { currentPinned(device) },
                set: { save(pinned: $0) })
            ) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Pin new notes").font(.system(size: 15)).foregroundStyle(Palette.ink)
                    Text("Each note stays up until the next one.")
                        .font(.system(size: 11)).foregroundStyle(Palette.faint)
                }
            }
            .tint(Palette.rose300)
            .padding(.vertical, 10)
        }
        .padding(.horizontal, 16)
        .background(Color.white.opacity(0.85))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Palette.ash200.opacity(0.7), lineWidth: 1))
        .foregroundStyle(Palette.ink)
        .tint(Palette.plum500)
    }

    private func readOnlySection(_ device: DeviceRow) -> some View {
        VStack(spacing: 0) {
            fieldRow("Theme") { Text(DeskTheme.label(device.theme)).foregroundStyle(Palette.muted) }
            divider
            fieldRow("Firmware") { Text(device.firmwareVersion ?? "—").foregroundStyle(Palette.muted) }
        }
        .padding(.horizontal, 16)
        .background(Color.white.opacity(0.85))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func unpairButton(_ device: DeviceRow) -> some View {
        Button("Unpair this desk", role: .destructive) { confirmingUnpair = true }
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(Palette.rose400)
            .frame(maxWidth: .infinity)
            .confirmationDialog("Unpair \(device.name)?", isPresented: $confirmingUnpair, titleVisibility: .visible) {
                Button("Unpair", role: .destructive) { unpair(device) }
                Button("Keep it", role: .cancel) {}
            } message: {
                Text("It goes back to showing a pairing code until someone claims it again.")
            }
    }

    private func fieldRow<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        HStack {
            Text(label).font(.system(size: 15)).foregroundStyle(Palette.ink)
            Spacer(minLength: 12)
            content().font(.system(size: 15))
        }
        .padding(.vertical, 12)
    }

    private var divider: some View {
        Rectangle().fill(Palette.ash200.opacity(0.7)).frame(height: 1)
    }

    private func lastSeen(_ device: DeviceRow) -> String {
        device.lastSeenAt.map { "Seen \(RelativeTime.short($0))" } ?? "Offline"
    }

    // MARK: - Saving

    private func loadDraft() {
        guard !loaded, let device else { return }
        name = device.name
        location = device.locationName ?? ""
        loaded = true
    }

    private func currentTheme(_ device: DeviceRow) -> String {
        draftTheme ?? (DeskTheme.isValid(device.theme ?? "") ? device.theme! : "cream")
    }
    private func currentAccent(_ device: DeviceRow) -> String {
        draftAccent ?? (DeskAccent.isValid(device.accentColor ?? "") ? device.accentColor! : "rose")
    }
    private func currentCard(_ device: DeviceRow) -> String {
        draftCard ?? (DeskNoteCardBackground.isValid(device.noteCardBackground ?? "")
            ? device.noteCardBackground! : "match_theme")
    }
    private func currentPinned(_ device: DeviceRow) -> Bool {
        draftPinned ?? (device.pinnedModeEnabled ?? false)
    }

    private func save(theme: String? = nil, accent: String? = nil, card: String? = nil, pinned: Bool? = nil) {
        guard let device else { return }
        if let theme { draftTheme = theme }
        if let accent { draftAccent = accent }
        if let card { draftCard = card }
        if let pinned { draftPinned = pinned }
        Task {
            await write(
                device: device,
                name: device.name,
                location: device.locationName ?? "",
                theme: currentTheme(device),
                accent: currentAccent(device),
                card: currentCard(device),
                pinned: currentPinned(device))
        }
    }

    private func saveTextIfChanged() async {
        guard let device, isMine else { return }
        let newName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let newRoom = location.trimmingCharacters(in: .whitespacesAndNewlines)
        guard newName != device.name || newRoom != (device.locationName ?? "") else { return }
        await write(
            device: device, name: newName, location: newRoom,
            theme: currentTheme(device),
            accent: currentAccent(device),
            card: currentCard(device),
            pinned: currentPinned(device))
    }

    private func write(
        device: DeviceRow, name: String, location: String, theme: String, accent: String,
        card: String, pinned: Bool
    ) async {
        guard let viewerID = store.userID else { return }
        error = nil
        isSaving = true
        defer { isSaving = false }
        do {
            _ = try await DevicesAPI.updateSettings(
                deviceID: device.id, ownerID: device.ownerID, viewerID: viewerID,
                name: name, location: location, theme: theme, accent: accent,
                noteCardBackground: card, pinnedModeEnabled: pinned)
            withAnimation { savedNote = "Saved — the desk updates in a few seconds" }
            await store.refresh()
            try? await Task.sleep(for: .seconds(2.5))
            withAnimation { savedNote = nil }
        } catch {
            // Put the selection back where the database still has it.
            draftTheme = nil
            draftAccent = nil
            draftCard = nil
            draftPinned = nil
            self.error = (error as? DeskError)?.message ?? "That didn't save. Try again in a moment."
        }
    }

    private func unpair(_ device: DeviceRow) {
        guard let viewerID = store.userID else { return }
        Task {
            do {
                _ = try await DevicesAPI.unpair(deviceID: device.id, ownerID: device.ownerID, viewerID: viewerID)
                await store.refresh()
                dismiss()
            } catch let failure as DeskError {
                self.error = failure.message
            } catch {
                self.error = "That didn't unpair. Try again in a moment."
            }
        }
    }
}
