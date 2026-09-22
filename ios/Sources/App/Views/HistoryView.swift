import SwiftUI

/// The History tab: every note, filtered three ways, grouped by day.
struct HistoryView: View {
    @Environment(DeskStore.self) private var store

    var body: some View {
        @Bindable var store = store
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 10, pinnedViews: []) {
                    Picker("Show", selection: $store.historyFilter) {
                        ForEach(HistoryFilter.allCases) { filter in
                            Text(filter.label).tag(filter)
                        }
                    }
                    .pickerStyle(.segmented)
                    .padding(.bottom, 6)

                    if store.history.entries.isEmpty {
                        EmptyState(
                            title: store.isLoadingHistory ? "Loading…" : "No notes yet",
                            description: emptyDescription)
                    } else {
                        ForEach(days, id: \.title) { day in
                            Text(day.title)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(Palette.muted)
                                .padding(.top, 8)
                            ForEach(day.entries) { entry in
                                NoteRow(entry: entry)
                            }
                        }
                        if store.history.pageCount > 1 { pagination }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 32)
            }
            .refreshable { await store.refresh() }
            .deskBackground()
            .navigationTitle("History")
        }
    }

    private var emptyDescription: String {
        switch store.historyFilter {
        case .all: return "Notes you send, and ones that land on your desk, collect here."
        case .sent: return "Nothing sent yet — write one on the Desk tab."
        case .desk: return "Nothing has arrived on your desk yet."
        }
    }

    private struct Day {
        let title: String
        let entries: [MessageHistoryEntry]
    }

    /// The current page, bucketed by calendar day: Today, Yesterday, then
    /// "Mon, Sep 21". Entries are already newest first.
    private var days: [Day] {
        let calendar = Calendar.current
        var out: [Day] = []
        for entry in store.history.entries {
            let title: String
            if calendar.isDateInToday(entry.createdAt) {
                title = "Today"
            } else if calendar.isDateInYesterday(entry.createdAt) {
                title = "Yesterday"
            } else {
                title = entry.createdAt.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day())
            }
            if let last = out.last, last.title == title {
                out[out.count - 1] = Day(title: title, entries: last.entries + [entry])
            } else {
                out.append(Day(title: title, entries: [entry]))
            }
        }
        return out
    }

    private var pagination: some View {
        HStack {
            Button {
                Task { await store.goToHistoryPage(store.history.page - 1) }
            } label: {
                Label("Newer", systemImage: "chevron.left")
            }
            .disabled(store.history.page <= 1)

            Spacer()
            Text("\(store.history.page) of \(store.history.pageCount)")
                .font(.system(size: 12).monospacedDigit())
                .foregroundStyle(Palette.muted)
            Spacer()

            Button {
                Task { await store.goToHistoryPage(store.history.page + 1) }
            } label: {
                HStack(spacing: 4) {
                    Text("Older")
                    Image(systemName: "chevron.right")
                }
            }
            .disabled(store.history.page >= store.history.pageCount)
        }
        .font(.system(size: 14, weight: .medium))
        .tint(Palette.plum400)
        .padding(.vertical, 10)
    }
}
