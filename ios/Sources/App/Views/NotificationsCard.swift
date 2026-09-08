import SwiftUI
import UIKit

/// The Settings row for "tap me when a note lands".
///
/// Permission is asked for once, right after signing in. This is where it
/// can be turned on afterwards — or, once iOS has been told no, where the
/// way back to the system switch lives.
struct NotificationsCard: View {
    private let push = PushRegistrar.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        DeskCard(padding: 18) {
            VStack(alignment: .leading, spacing: 14) {
                PanelHeader(
                    title: "Notifications",
                    subtitle: "A gentle tap on the shoulder when your partner leaves a note on your desk. What it says stays between the two of you — the notification never shows it.")

                switch push.authorization {
                case .authorized, .provisional, .ephemeral:
                    Notice(text: "On — you will know the moment a note arrives.", tone: .success)
                case .denied:
                    Notice(
                        text: "Turned off in iOS Settings. Notes still land on your desk and in the app; this phone just stays quiet.",
                        tone: .info)
                    Button("Open iOS Settings") {
                        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                        UIApplication.shared.open(url)
                    }
                    .buttonStyle(SecondaryButtonStyle())
                default:
                    Button("Turn on notifications") {
                        Task { await push.requestPermission() }
                    }
                    .buttonStyle(SecondaryButtonStyle())
                }
            }
        }
        .task { await push.refreshAuthorization() }
        // Coming back from the Settings app is the one moment the answer
        // changes without this screen hearing about it.
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await push.refreshAuthorization() }
        }
    }
}
