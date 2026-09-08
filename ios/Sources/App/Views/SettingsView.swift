import SwiftUI

/// Account, your name, per-desk appearance, pairing, sign out.
/// Port of the web `/settings` page.
struct SettingsView: View {
    @Environment(DeskStore.self) private var store

    @State private var nameDraft = ""
    @State private var nameMessage: String?
    @State private var nameError: String?
    @State private var isSavingName = false
    @State private var confirmingSignOut = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    PageHeader(eyebrow: "Settings") {
                        Text("Just the ")
                            + Text("essentials").italic().foregroundColor(Palette.rose300)
                    }

                    DeskCard(padding: 18) {
                        PanelHeader(
                            title: "Account",
                            subtitle: "Signed in as \(store.email ?? "—")")
                    }

                    nameCard

                    NotificationsCard()

                    VStack(alignment: .leading, spacing: 12) {
                        SectionLabel(text: "Your desks")
                        if store.ownedDevices.isEmpty {
                            EmptyState(
                                title: "No desks on your account yet",
                                description: "Pair a display under Devices — then you can name it, set where it lives, and tune how messages behave.")
                        } else {
                            ForEach(store.ownedDevices) { device in
                                DeviceSettingsCard(device: device)
                            }
                        }
                    }

                    DeskCard(padding: 18) {
                        PanelHeader(title: "Your pair", subtitle: pairSummary)
                    }

                    DeskCard(padding: 18) {
                        VStack(alignment: .leading, spacing: 14) {
                            PanelHeader(
                                title: "Sign out",
                                subtitle: "You can come back whenever you like.")
                            Button("Sign out") { confirmingSignOut = true }
                                .buttonStyle(SecondaryButtonStyle())
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 40)
            }
            .scrollDismissesKeyboard(.interactively)
            .refreshable { await store.refresh() }
            .deskBackground()
            .navigationBarTitleDisplayMode(.inline)
            .onAppear { nameDraft = store.displayName ?? "" }
            .confirmationDialog("Sign out of DeskNote?", isPresented: $confirmingSignOut) {
                Button("Sign out", role: .destructive) { Task { await store.signOut() } }
                Button("Stay signed in", role: .cancel) {}
            }
        }
    }

    private var pairSummary: String {
        if store.isLinked {
            return "You are linked with \(store.partnerLabel). Notes and devices are shared between your accounts."
        }
        if store.isWaitingForPartner {
            return "We are still waiting for your partner to enter your invite code. You can create a fresh code from the Pair tab."
        }
        return "Create an invite code or join with your partner’s code to share notes and desk devices."
    }

    private var nameCard: some View {
        DeskCard(padding: 18) {
            VStack(alignment: .leading, spacing: 12) {
                PanelHeader(
                    title: "Your name",
                    subtitle: "Shown to your partner in history and on their desk.")

                TextField("Your name", text: $nameDraft)
                    .textContentType(.name)
                    .deskFieldChrome()

                if let nameError { Notice(text: nameError, tone: .danger) }
                if let nameMessage { Notice(text: nameMessage, tone: .success) }

                Button(isSavingName ? "Saving…" : "Save name", action: saveName)
                    .buttonStyle(SecondaryButtonStyle())
                    .disabled(isSavingName)
            }
        }
    }

    private func saveName() {
        guard let userID = store.userID else { return }
        nameError = nil
        nameMessage = nil
        isSavingName = true
        Task {
            defer { isSavingName = false }
            do {
                let (message, _) = try await ProfileAPI.updateDisplayName(
                    userID: userID, raw: nameDraft)
                nameMessage = message
                await store.refresh()
                nameDraft = store.displayName ?? ""
            } catch let failure as DeskError {
                nameError = failure.message
            } catch {
                nameError = "We could not save your name just now. Please try again."
            }
        }
    }
}
