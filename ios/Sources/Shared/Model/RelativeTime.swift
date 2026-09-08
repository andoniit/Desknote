import Foundation

/// Human-friendly "when" for history and desk status.
/// Port of `lib/messages/format-time.ts`.
enum RelativeTime {
    static func short(_ date: Date, now: Date = Date()) -> String {
        let seconds = Int((now.timeIntervalSince(date)).rounded())
        if seconds < 45 { return "just now" }
        let minutes = Int((Double(seconds) / 60).rounded())
        if minutes < 60 { return "\(minutes)m ago" }
        let hours = Int((Double(minutes) / 60).rounded())
        if hours < 24 { return "\(hours)h ago" }
        let days = Int((Double(hours) / 24).rounded())
        if days < 7 { return "\(days)d ago" }
        return date.formatted(.dateTime.month(.abbreviated).day())
    }

    /// Longer subtitle, e.g. "Tue, Apr 17 · 3:42 PM".
    static func detail(_ date: Date) -> String {
        date.formatted(
            .dateTime.weekday(.abbreviated).month(.abbreviated).day()
                .hour().minute())
    }
}
