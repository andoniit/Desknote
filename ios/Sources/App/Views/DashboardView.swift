import SwiftUI

/// The Desk tab: say hello, see both desks, write and send — without
/// scrolling. The latest notes sit underneath; the rest live in History.
struct DashboardView: View {
    @Environment(DeskStore.self) private var store
    var onSeeAll: () -> Void = {}
    var onOpenDesks: () -> Void = {}

    @State private var destination: QuickSendTarget = .theirDesk
    @State private var showPartner = false

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        switch hour {
        case 5..<12: return "Good morning"
        case 12..<17: return "Good afternoon"
        case 17..<22: return "Good evening"
        default: return "Hello"
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 10) {
                        (Text("\(greeting), ")
                            + Text(store.viewerLabel).italic().foregroundColor(Palette.rose300))
                            .font(.display(28))
                            .foregroundStyle(Palette.ink)
                        if !store.devices.isEmpty { DeskStatusStrip() }
                    }
                    .padding(.horizontal, 20)

                    if !store.hasLoaded {
                        ProgressView()
                            .tint(Palette.rose300)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 60)
                    } else if store.devices.isEmpty {
                        EmptyState(
                            title: "Pair your first desk",
                            description: "Plug in your DeskNote display — it shows a six-digit code to enter here.",
                            actionLabel: "Pair a desk",
                            action: onOpenDesks)
                            .padding(.horizontal, 20)
                    } else {
                        ComposerView(destination: $destination)
                            .padding(.horizontal, 20)
                        QuickTapsRow(destination: destination)
                    }

                    if store.hasLoaded && !store.isLinked {
                        partnerPrompt.padding(.horizontal, 20)
                    }

                    if !store.recent.isEmpty { recent.padding(.horizontal, 20) }
                }
                .padding(.top, 12)
                .padding(.bottom, 32)
            }
            .scrollDismissesKeyboard(.interactively)
            .refreshable { await store.refresh() }
            .deskBackground()
            .toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $showPartner) {
                NavigationStack { RelationshipView() }
            }
        }
    }

    private var partnerPrompt: some View {
        Button { showPartner = true } label: {
            HStack(spacing: 12) {
                Image(systemName: "person.2.fill")
                    .font(.system(size: 15))
                    .foregroundStyle(Palette.rose400)
                    .frame(width: 36, height: 36)
                    .background(Palette.rose50)
                    .clipShape(Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text(store.isWaitingForPartner ? "Waiting for your partner" : "Link with your partner")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Palette.ink)
                    Text(store.isWaitingForPartner
                         ? "They haven't entered your code yet."
                         : "Share an invite code to send to each other's desks.")
                        .font(.system(size: 12))
                        .foregroundStyle(Palette.muted)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Palette.faint)
            }
            .padding(14)
            .background(Color.white.opacity(0.85))
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(Palette.rose100, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private var recent: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                SectionLabel(text: "Recent")
                Spacer()
                Button("See all", action: onSeeAll)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Palette.rose400)
            }
            ForEach(store.recent.prefix(2)) { entry in
                NoteRow(entry: entry)
            }
        }
    }
}
