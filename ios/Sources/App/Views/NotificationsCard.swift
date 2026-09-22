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
        HStack(spacing: 12) {
            Image(systemName: isOn ? "bell.fill" : "bell.slash")
                .font(.system(size: 14))
                .foregroundStyle(isOn ? Palette.rose400 : Palette.plum300)
                .frame(width: 32, height: 32)
                .background(isOn ? Palette.rose50 : Palette.cream200)
                .clipShape(Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text("Notifications").font(.system(size: 15)).foregroundStyle(Palette.ink)
                Text(caption).font(.system(size: 12)).foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            switch push.authorization {
            case .authorized, .provisional, .ephemeral:
                EmptyView()
            case .denied:
                Button("Settings") {
                    guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                    UIApplication.shared.open(url)
                }
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Palette.rose400)
            default:
                Button("Turn on") { Task { await push.requestPermission() } }
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Palette.rose400)
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

    private var isOn: Bool {
        switch push.authorization {
        case .authorized, .provisional, .ephemeral: return true
        default: return false
        }
    }

    private var caption: String {
        switch push.authorization {
        case .authorized, .provisional, .ephemeral:
            return "On — you'll know when a note lands. The words stay private."
        case .denied:
            return "Off in iOS Settings."
        default:
            return "Get a nudge when a note lands on your desk."
        }
    }
}
