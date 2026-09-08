import SwiftUI

/// Recent history: filter chips, ten per page, seen / unseen from the
/// note's delivery status. Port of `MessageHistorySection`.
struct HistoryView: View {
    @Environment(DeskStore.self) private var store

    var body: some View {
        @Bindable var store = store

        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                SectionLabel(text: "Recent history")
                Spacer()
                if store.history.totalCount > 0 {
                    Text("\(store.history.totalCount) total")
                        .font(.system(size: 11))
                        .foregroundStyle(Palette.faint)
                }
            }

            Picker("Filter", selection: $store.historyFilter) {
                ForEach(HistoryFilter.allCases) { filter in
                    Text(filter.label).tag(filter)
                }
            }
            .pickerStyle(.segmented)

            if store.history.entries.isEmpty {
                EmptyState(
                    title: store.isLoadingHistory ? "Loading…" : "Nothing here yet",
                    description: emptyDescription)
            } else {
                ForEach(store.history.entries) { entry in
                    row(entry)
                }
                if store.history.pageCount > 1 { pagination }
            }
        }
    }

    private var emptyDescription: String {
        switch store.historyFilter {
        case .all: return "Messages you send — and ones that land on your desks — will collect here."
        case .sent: return "Nothing sent from this account yet. Write something above."
        case .desk: return "No messages have arrived on your own desk yet."
        }
    }

    private func row(_ entry: MessageHistoryEntry) -> some View {
        DeskCard(padding: 14) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Text(entry.senderLabel)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Palette.plum400)
                    Text("→").foregroundStyle(Palette.faint).font(.system(size: 11))
                    Text(entry.deviceName)
                        .font(.system(size: 12))
                        .foregroundStyle(Palette.muted)
                        .lineLimit(1)
                    Spacer(minLength: 4)
                    Text(RelativeTime.short(entry.createdAt))
                        .font(.system(size: 11))
                        .foregroundStyle(Palette.faint)
                }

                if entry.messageType == .secret {
                    // The desk reveals a secret once and then destroys it,
                    // so history shows that it existed, not what it said.
                    HStack(spacing: 6) {
                        Image(systemName: "lock.fill").font(.system(size: 11))
                        Text("Secret note — readable once on the desk")
                            .font(.system(size: 14).italic())
                    }
                    .foregroundStyle(Palette.plum300)
                } else {
                    DeskText(content: entry.content, size: 15)
                        .fixedSize(horizontal: false, vertical: true)
                }

                HStack(spacing: 6) {
                    chip(entry.seenState.label, tone: entry.seenState)
                    if entry.isPinned { chip("Pinned", tone: .unknown) }
                    if entry.messageType == .quickSend { chip("Quick tap", tone: .unknown) }
                    Spacer(minLength: 0)
                    Text(RelativeTime.detail(entry.createdAt))
                        .font(.system(size: 10))
                        .foregroundStyle(Palette.faint)
                }
            }
        }
    }

    private func chip(_ text: String, tone: SeenState) -> some View {
        Text(text)
            .font(.system(size: 10, weight: .medium))
            .foregroundStyle(tone == .seen ? Palette.rose400 : Palette.muted)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(tone == .seen ? Palette.rose50 : Palette.cream200)
            .clipShape(Capsule())
    }

    private var pagination: some View {
        HStack {
            Button {
                Task { await store.goToHistoryPage(store.history.page - 1) }
            } label: {
                Label("Newer", systemImage: "chevron.left")
                    .font(.system(size: 13, weight: .medium))
            }
            .disabled(store.history.page <= 1)

            Spacer()
            Text("Page \(store.history.page) of \(store.history.pageCount)")
                .font(.system(size: 12))
                .foregroundStyle(Palette.muted)
            Spacer()

            Button {
                Task { await store.goToHistoryPage(store.history.page + 1) }
            } label: {
                Label("Older", systemImage: "chevron.right")
                    .labelStyle(TrailingIconLabelStyle())
                    .font(.system(size: 13, weight: .medium))
            }
            .disabled(store.history.page >= store.history.pageCount)
        }
        .tint(Palette.plum400)
        .padding(.top, 2)
    }
}

/// Chevron after the word, so "Older ›" points the way it moves.
private struct TrailingIconLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 4) {
            configuration.title
            configuration.icon
        }
    }
}
