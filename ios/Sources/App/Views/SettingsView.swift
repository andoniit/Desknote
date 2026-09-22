import SwiftUI

/// Account, your name, notifications, your partner. Desk settings live on
/// the Desks tab, next to the desks themselves.
struct SettingsView: View {
    @Environment(DeskStore.self) private var store

    @State private var nameDraft = ""
    @State private var nameError: String?
    @State private var savedName = false
    @State private var isSavingName = false
    @State private var confirmingSignOut = false

    private var nameChanged: Bool {
        nameDraft.trimmingCharacters(in: .whitespacesAndNewlines) != (store.displayName ?? "")
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    group("You") {
                        HStack {
                            Text("Name").font(.system(size: 15)).foregroundStyle(Palette.ink)
                            Spacer(minLength: 12)
                            TextField("Your name", text: $nameDraft)
                                .multilineTextAlignment(.trailing)
                                .textContentType(.name)
                                .submitLabel(.done)
                                .onSubmit(saveName)
                                .foregroundStyle(Palette.ink)
                                .tint(Palette.plum500)
                            if nameChanged {
                                Button(isSavingName ? "Saving" : "Save", action: saveName)
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(Palette.rose400)
                                    .disabled(isSavingName)
                            } else if savedName {
                                Image(systemName: "checkmark.circle.fill").foregroundStyle(Palette.rose300)
                            }
                        }
                        .padding(.vertical, 12)
                        divider
                        HStack {
                            Text("Email").font(.system(size: 15)).foregroundStyle(Palette.ink)
                            Spacer()
                            Text(store.email ?? "—")
                                .font(.system(size: 14))
                                .foregroundStyle(Palette.muted)
                                .lineLimit(1)
                        }
                        .padding(.vertical, 12)
                    }
                    Text("Your partner sees your name in history and on their desk.")
                        .font(.system(size: 11))
                        .foregroundStyle(Palette.faint)
                        .padding(.horizontal, 4)
                        .padding(.top, -14)
                    if let nameError { Notice(text: nameError, tone: .danger) }

                    group("Alerts") {
                        NotificationsCard().padding(.vertical, 12)
                    }

                    group("Partner") {
                        NavigationLink {
                            RelationshipView()
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "person.2.fill")
                                    .font(.system(size: 13))
                                    .foregroundStyle(Palette.rose400)
                                    .frame(width: 32, height: 32)
                                    .background(Palette.rose50)
                                    .clipShape(Circle())
                                Text(partnerTitle).font(.system(size: 15)).foregroundStyle(Palette.ink)
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(Palette.faint)
                            }
                            .padding(.vertical, 12)
                        }
                        .buttonStyle(.plain)
                    }

                    Button("Sign out") { confirmingSignOut = true }
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Palette.rose400)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 4)
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 32)
            }
            .scrollDismissesKeyboard(.interactively)
            .refreshable { await store.refresh() }
            .deskBackground()
            .navigationTitle("Settings")
            .onAppear { nameDraft = store.displayName ?? "" }
            .confirmationDialog("Sign out of DeskNote?", isPresented: $confirmingSignOut, titleVisibility: .visible) {
                Button("Sign out", role: .destructive) { Task { await store.signOut() } }
                Button("Stay signed in", role: .cancel) {}
            }
        }
    }

    private var partnerTitle: String {
        if store.isLinked { return "Linked with \(store.partnerLabel)" }
        if store.isWaitingForPartner { return "Waiting for your partner" }
        return "Link with your partner"
    }

    private func group<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: title).padding(.horizontal, 4)
            VStack(spacing: 0) { content() }
                .padding(.horizontal, 16)
                .background(Color.white.opacity(0.85))
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(Palette.ash200.opacity(0.7), lineWidth: 1))
        }
    }

    private var divider: some View {
        Rectangle().fill(Palette.ash200.opacity(0.7)).frame(height: 1)
    }

    private func saveName() {
        guard let userID = store.userID, nameChanged else { return }
        nameError = nil
        isSavingName = true
        Task {
            defer { isSavingName = false }
            do {
                _ = try await ProfileAPI.updateDisplayName(userID: userID, raw: nameDraft)
                await store.refresh()
                nameDraft = store.displayName ?? ""
                savedName = true
            } catch let failure as DeskError {
                nameError = failure.message
            } catch {
                nameError = "That didn't save. Try again in a moment."
            }
        }
    }
}
