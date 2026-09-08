import AppIntents
import SwiftUI
import WidgetKit

/// One desk's current message, on the home screen.
///
/// The widget queries Supabase itself rather than only rendering what the
/// app last cached — a note your partner sends while your phone sits in a
/// pocket should still land here. The cache is the first thing it draws,
/// so a newly placed widget is never blank while the network catches up.
struct DeskWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: "space.desknote.desk",
            intent: SelectDeskIntent.self,
            provider: DeskProvider()
        ) { entry in
            DeskWidgetView(entry: entry)
                .containerBackground(Palette.cream, for: .widget)
        }
        .configurationDisplayName("On the desk")
        .description("The message showing on your desk display right now.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct DeskEntry: TimelineEntry {
    let date: Date
    let snapshot: DeskSnapshot?
    let state: State

    enum State {
        case ready
        case signedOut
        case noDesk
    }
}

struct DeskProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> DeskEntry {
        DeskEntry(date: Date(), snapshot: .preview, state: .ready)
    }

    /// The gallery preview and the moment a widget is first placed. Cached
    /// desks make that preview the user's own rather than invented copy.
    func snapshot(for configuration: SelectDeskIntent, in context: Context) async -> DeskEntry {
        let cached = pick(configuration.desk, from: SharedContainer.readSnapshots())
        return DeskEntry(date: Date(), snapshot: cached ?? .preview, state: .ready)
    }

    func timeline(for configuration: SelectDeskIntent, in context: Context) async -> Timeline<DeskEntry> {
        let now = Date()
        let entry: DeskEntry

        if let fresh = await DeskSnapshotAPI.fetchAll() {
            SharedContainer.writeSnapshots(fresh)
            if let desk = pick(configuration.desk, from: fresh) {
                entry = DeskEntry(date: now, snapshot: desk, state: .ready)
            } else {
                entry = DeskEntry(date: now, snapshot: nil, state: .noDesk)
            }
        } else if let cached = pick(configuration.desk, from: SharedContainer.readSnapshots()) {
            // No session *right now* can also mean a refresh that failed
            // offline, so last-known beats an accusing "sign in" card.
            entry = DeskEntry(date: now, snapshot: cached, state: .ready)
        } else {
            entry = DeskEntry(date: now, snapshot: nil, state: .signedOut)
        }

        // Quarter-hourly is about as often as WidgetKit will honour for a
        // widget nobody is looking at; the app also nudges a reload after
        // every send and every realtime event, which is what makes a note
        // you just wrote appear immediately.
        return Timeline(entries: [entry], policy: .after(now.addingTimeInterval(15 * 60)))
    }

    private func pick(_ choice: DeskChoice, from snapshots: [DeskSnapshot]) -> DeskSnapshot? {
        let wanted: DeskSnapshot.Owner = choice == .mine ? .mine : .theirs
        return snapshots.first { $0.owner == wanted }
            // A desk with no clear side still beats showing nothing.
            ?? snapshots.first { $0.owner == .shared }
    }
}

// MARK: - Views

struct DeskWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: DeskEntry

    var body: some View {
        content
            // Tapping anywhere opens the app on the desk that sent you here.
            .widgetURL(entry.snapshot.map {
                URL(string: "desknote://desk?device=\($0.deviceID.uuidString)")!
            } ?? URL(string: "desknote://desk")!)
    }

    @ViewBuilder
    private var content: some View {
        switch entry.state {
        case .signedOut:
            placeholder(
                title: "Sign in",
                line: "Open DeskNote to see what is on your desk.")
        case .noDesk:
            placeholder(
                title: "No desk yet",
                line: "Pair a display in DeskNote and it will show up here.")
        case .ready:
            if let snapshot = entry.snapshot {
                desk(snapshot)
            } else {
                placeholder(title: "No desk yet", line: "Pair a display in DeskNote.")
            }
        }
    }

    private func desk(_ snapshot: DeskSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            header(snapshot)

            Spacer(minLength: 8)

            if let message = snapshot.message {
                if message.isSecret {
                    HStack(spacing: 5) {
                        Image(systemName: "lock.fill").font(.system(size: 11))
                        Text("A secret note is waiting")
                            .font(.system(size: family == .systemSmall ? 13 : 15).italic())
                    }
                    .foregroundStyle(Palette.plum300)
                } else {
                    DeskText(
                        content: message.body,
                        size: family == .systemSmall ? 15 : 18,
                        weight: .medium)
                        .lineLimit(family == .systemSmall ? 4 : 3)
                        .minimumScaleFactor(0.8)
                }
            } else {
                Text("Nothing on the desk yet.")
                    .font(.system(size: family == .systemSmall ? 13 : 15))
                    .foregroundStyle(Palette.muted)
            }

            Spacer(minLength: 8)

            footer(snapshot)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private func header(_ snapshot: DeskSnapshot) -> some View {
        HStack(spacing: 5) {
            Circle()
                .fill(snapshot.online ? Palette.accent(snapshot.accentID) : Palette.plum200)
                .frame(width: 6, height: 6)
            Text(snapshot.deskName.uppercased())
                .font(.system(size: 9, weight: .medium))
                .tracking(1.1)
                .foregroundStyle(Palette.faint)
                .lineLimit(1)
            Spacer(minLength: 0)
            if family != .systemSmall {
                Text(snapshot.owner.label)
                    .font(.system(size: 9, weight: .medium))
                    .tracking(0.6)
                    .foregroundStyle(Palette.faint)
            }
        }
    }

    private func footer(_ snapshot: DeskSnapshot) -> some View {
        HStack(spacing: 4) {
            if let message = snapshot.message {
                Text(message.senderLabel)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(Palette.plum400)
                Text("·").foregroundStyle(Palette.faint).font(.system(size: 10))
                Text(RelativeTime.short(message.createdAt, now: entry.date))
                    .font(.system(size: 10))
                    .foregroundStyle(Palette.faint)
                Spacer(minLength: 0)
                if message.seenState != .unknown {
                    Text(message.seenState.label)
                        .font(.system(size: 9, weight: .medium))
                        .foregroundStyle(
                            message.seenState == .seen ? Palette.rose400 : Palette.muted)
                }
            } else {
                Text(snapshot.online ? "Online" : "Offline")
                    .font(.system(size: 10))
                    .foregroundStyle(snapshot.online ? Palette.rose400 : Palette.faint)
                Spacer(minLength: 0)
            }
        }
    }

    private func placeholder(title: String, line: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.display(15, weight: .semibold))
                .foregroundStyle(Palette.ink)
            Text(line)
                .font(.system(size: 12))
                .foregroundStyle(Palette.muted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

private extension DeskSnapshot {
    /// Stand-in for the widget gallery before any real desk is cached.
    static let preview = DeskSnapshot(
        deviceID: UUID(),
        deskName: "Her desk",
        owner: .theirs,
        accentID: "rose",
        online: true,
        lastSeenAt: Date(),
        message: Message(
            body: "Eat lunch",
            isSecret: false,
            senderLabel: "You",
            createdAt: Date().addingTimeInterval(-600),
            status: .queued),
        capturedAt: Date())
}
