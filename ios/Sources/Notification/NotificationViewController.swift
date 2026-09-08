import SwiftUI
import UIKit
import UserNotifications
import UserNotificationsUI

/// The notification content extension: what a DeskNote push turns into
/// when it is pulled down or long-pressed.
///
/// It draws `NoteArrivedCard` from the payload alone — there is no network
/// call and no session here, because there is nothing to fetch. The push
/// says a note is waiting and who left it, and that is the whole card.
/// Reading it still means opening the app, or walking over to the desk.
final class NotificationViewController: UIViewController, UNNotificationContentExtension {
    private var host: UIHostingController<NoteArrivedCard>?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(Palette.cream)
    }

    func didReceive(_ notification: UNNotification) {
        let content = notification.request.content
        let info = content.userInfo

        let card = NoteArrivedCard(
            headline: Self.text(content.title) ?? "You have a message on your desk",
            senderName: Self.text(info["sender_name"]),
            deskName: Self.text(info["desk_name"]),
            arrivedAt: Self.date(info["sent_at"]) ?? notification.date)

        // `didReceive` can be called more than once for the same view
        // controller, so the previous card goes first.
        host?.willMove(toParent: nil)
        host?.view.removeFromSuperview()
        host?.removeFromParent()

        let hosting = UIHostingController(rootView: card)
        hosting.view.backgroundColor = .clear
        addChild(hosting)
        hosting.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(hosting.view)
        NSLayoutConstraint.activate([
            hosting.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hosting.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            hosting.view.topAnchor.constraint(equalTo: view.topAnchor),
            hosting.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        hosting.didMove(toParent: self)
        host = hosting

        // The plist's initial ratio is only a first guess; measuring the
        // card keeps the sheet from cropping a long name or clipping the
        // footer.
        let width = view.bounds.width > 0 ? view.bounds.width : UIScreen.main.bounds.width
        let fitted = hosting.sizeThatFits(
            in: CGSize(width: width, height: .greatestFiniteMagnitude))
        preferredContentSize = CGSize(width: width, height: max(fitted.height, 260))
    }

    private static func text(_ value: Any?) -> String? {
        guard let string = value as? String else { return nil }
        let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    /// `sent_at` arrives as the `timestamptz` Postgres printed, with a
    /// variable number of fractional digits.
    private static func date(_ value: Any?) -> Date? {
        guard let raw = text(value) else { return nil }
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let whole = ISO8601DateFormatter()
        whole.formatOptions = [.withInternetDateTime]

        var value = raw
        if let dot = value.firstIndex(of: "."),
           let tzStart = value[dot...].firstIndex(where: { $0 == "+" || $0 == "-" || $0 == "Z" }) {
            let digits = value[value.index(after: dot)..<tzStart]
            if digits.count > 3 {
                let keep = value.index(dot, offsetBy: 4)
                value.replaceSubrange(keep..<tzStart, with: "")
            }
        }
        return withFraction.date(from: value) ?? whole.date(from: value)
    }
}
