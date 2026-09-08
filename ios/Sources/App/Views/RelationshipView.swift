import SwiftUI

/// Link the two accounts: share an invite code, or enter your partner's.
/// Port of the web `/relationship` page and `RelationshipSetupForms`.
struct RelationshipView: View {
    @Environment(DeskStore.self) private var store

    @State private var invitedEmail = ""
    @State private var invite: RelationshipAPI.Invite?
    @State private var inviteError: String?
    @State private var isCreatingInvite = false

    @State private var joinCode = ""
    @State private var joinMessage: String?
    @State private var joinError: String?
    @State private var isJoining = false

    @State private var unpairMessage: String?
    @State private var unpairError: String?
    @State private var isUnpairing = false
    @State private var confirmingUnpair = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    PageHeader(
                        eyebrow: "For two",
                        description: "DeskNote is made for one pair. Create a short-lived invite code for your partner, or enter theirs — once you are linked, notes and devices are shared between you."
                    ) {
                        Text("Link your ")
                            + Text("desks together").italic().foregroundColor(Palette.rose300)
                    }

                    if store.isLinked {
                        pairedCard
                    } else {
                        if store.isWaitingForPartner {
                            Notice(
                                text: "You already started a pair and we are waiting for your partner to enter the code. You can create a fresh code below; the old one will stop working.",
                                tone: .info)
                        }
                        shareCard
                        joinCard
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
        }
    }

    // MARK: - Linked

    private var pairedCard: some View {
        DeskCard(padding: 18) {
            VStack(alignment: .leading, spacing: 14) {
                PanelHeader(
                    title: "You are linked",
                    subtitle: "Paired with \(store.partnerLabel). Notes and devices are shared between your accounts.")

                switch store.unpairState {
                case .requestedByMe:
                    Notice(
                        text: "You asked to unpair. Nothing changes until \(store.partnerLabel) confirms — tap again to cancel.",
                        tone: .info)
                case .requestedByPartner:
                    Notice(
                        text: "\(store.partnerLabel) asked to unpair. Confirming ends the pair for both of you.",
                        tone: .danger)
                case .none:
                    EmptyView()
                }

                if let unpairMessage { Notice(text: unpairMessage, tone: .success) }
                if let unpairError { Notice(text: unpairError, tone: .danger) }

                Button(unpairButtonTitle) { confirmingUnpair = true }
                    .buttonStyle(SecondaryButtonStyle())
                    .disabled(isUnpairing)
                    .confirmationDialog(
                        unpairButtonTitle,
                        isPresented: $confirmingUnpair,
                        titleVisibility: .visible
                    ) {
                        Button(unpairButtonTitle, role: .destructive, action: toggleUnpair)
                        Button("Keep us linked", role: .cancel) {}
                    } message: {
                        Text("Unpairing is two-sided: nothing happens until you both agree.")
                    }
            }
        }
    }

    private var unpairButtonTitle: String {
        switch store.unpairState {
        case .requestedByMe: return "Cancel unpair request"
        case .requestedByPartner: return "Confirm unpair"
        case .none: return "Request to unpair"
        }
    }

    // MARK: - Not linked

    private var shareCard: some View {
        DeskCard(padding: 18) {
            VStack(alignment: .leading, spacing: 14) {
                PanelHeader(
                    title: "Share an invite",
                    subtitle: "Create a one-time code for your partner. It stays gentle but private — treat it like a house key.")

                VStack(alignment: .leading, spacing: 6) {
                    SectionLabel(text: "Partner email (optional)")
                    TextField("them@example.com", text: $invitedEmail)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .deskFieldChrome()
                    Text("If you add an email, only someone signed in with that exact address can use the code.")
                        .font(.system(size: 11))
                        .foregroundStyle(Palette.faint)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if let invite {
                    VStack(alignment: .leading, spacing: 6) {
                        SectionLabel(text: "Their code")
                        HStack {
                            Text(invite.code)
                                .font(.system(size: 22, weight: .semibold, design: .monospaced))
                                .tracking(3)
                                .foregroundStyle(Palette.ink)
                            Spacer()
                            // Sending it is the whole point, so copying is
                            // one tap rather than a select-and-hold.
                            Button {
                                UIPasteboard.general.string = invite.code
                            } label: {
                                Label("Copy", systemImage: "doc.on.doc")
                                    .font(.system(size: 13, weight: .medium))
                            }
                            .tint(Palette.plum400)
                        }
                        .padding(14)
                        .background(Palette.blush50)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

                        Text("Expires \(RelativeTime.detail(invite.expiresAt)).")
                            .font(.system(size: 11))
                            .foregroundStyle(Palette.faint)
                    }
                }

                if let inviteError { Notice(text: inviteError, tone: .danger) }

                Button(isCreatingInvite ? "Creating…" : "Create an invite code", action: createInvite)
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(isCreatingInvite)
            }
        }
    }

    private var joinCard: some View {
        DeskCard(padding: 18) {
            VStack(alignment: .leading, spacing: 14) {
                PanelHeader(
                    title: "Enter their code",
                    subtitle: "Got a code from your partner? Type it in and your desks join up.")

                TextField("A1B2C3D4E5", text: $joinCode)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .font(.system(size: 17, design: .monospaced))
                    .tracking(2)
                    .onChange(of: joinCode) { _, new in
                        joinCode = InviteValidation.normalizeCode(new)
                    }
                    .deskFieldChrome()

                if let joinError { Notice(text: joinError, tone: .danger) }
                if let joinMessage { Notice(text: joinMessage, tone: .success) }

                Button(isJoining ? "Linking…" : "Link our desks", action: join)
                    .buttonStyle(SecondaryButtonStyle())
                    .disabled(isJoining || joinCode.count < 6)
            }
        }
    }

    // MARK: - Actions

    private func createInvite() {
        inviteError = nil
        isCreatingInvite = true
        Task {
            defer { isCreatingInvite = false }
            do {
                invite = try await RelationshipAPI.createInvite(
                    invitedEmail: invitedEmail.isEmpty ? nil : invitedEmail)
                await store.refresh()
            } catch let failure as DeskError {
                inviteError = failure.message
            } catch {
                inviteError = "We could not create an invite just now. Please try again in a moment."
            }
        }
    }

    private func join() {
        joinError = nil
        joinMessage = nil
        isJoining = true
        Task {
            defer { isJoining = false }
            do {
                joinMessage = try await RelationshipAPI.joinInvite(code: joinCode)
                joinCode = ""
                await store.refresh()
            } catch let failure as DeskError {
                joinError = failure.message
            } catch {
                joinError = "Something went wrong while linking. Please try again."
            }
        }
    }

    private func toggleUnpair() {
        unpairError = nil
        unpairMessage = nil
        isUnpairing = true
        Task {
            defer { isUnpairing = false }
            do {
                unpairMessage = try await RelationshipAPI.toggleUnpair()
                await store.refresh()
            } catch let failure as DeskError {
                unpairError = failure.message
            } catch {
                unpairError = "We could not update the pair right now. Please try again."
            }
        }
    }
}
