import SwiftUI

/// The desk: composer, quick taps, live desk status, recent history.
/// Same order and same content as the web `/dashboard`.
struct DashboardView: View {
    @Environment(DeskStore.self) private var store

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    PageHeader(
                        eyebrow: "Your desk",
                        description: "Messages you save here stay in your history and travel to the desks you pick."
                    ) {
                        Text("\(greeting), ")
                            + Text(store.viewerLabel).italic().foregroundColor(Palette.rose300)
                    }

                    if store.isLinked {
                        Notice(
                            text: "Paired with \(store.partnerLabel). Notes and devices are shared between your desks.",
                            tone: .info)
                    } else {
                        Notice(
                            text: "To include their desk in “both”, link once on the Pair tab — you can still message your own paired displays anytime.",
                            tone: .info)
                    }

                    ComposerView()
                    QuickSendView()
                    DeskStatusView()
                    HistoryView()
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 40)
            }
            .scrollDismissesKeyboard(.interactively)
            .refreshable { await store.refresh() }
            .deskBackground()
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Palette.cream, for: .navigationBar)
        }
    }

    private var greeting: String {
        switch Calendar.current.component(.hour, from: Date()) {
        case ..<5: return "Still up"
        case ..<12: return "Good morning"
        case ..<18: return "Good afternoon"
        default: return "Good evening"
        }
    }
}
