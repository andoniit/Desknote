import Foundation
import Supabase
import UIKit
import UserNotifications

/// The phone half of "a note landed on your desk".
///
/// A desk hears about a new note over MQTT within a second. The other
/// person's phone has no such channel while the app is closed, so it
/// registers its APNs token against the signed-in account and the
/// `push-notify` Edge Function taps it when a message is addressed to a
/// desk they own.
///
/// The push itself never carries the note — only that one is waiting and
/// who left it. Secret one-time notes therefore keep their secret on the
/// lock screen, exactly as they do on the desk.
@MainActor
@Observable
final class PushRegistrar {
    static let shared = PushRegistrar()

    /// The category the payload names and `Sources/Notification` claims —
    /// it is what turns the banner into the paper-note card when pulled
    /// down.
    static let category = "DESK_NOTE"

    private(set) var authorization: UNAuthorizationStatus = .notDetermined
    /// Set when a notification is tapped, so `RootView` can land on the
    /// desk it came from. A value rather than a flag: two taps in a row
    /// on the same desk must still register as two.
    private(set) var tappedDesk: DeskTap?

    struct DeskTap: Equatable {
        let deviceID: UUID?
        let at: Date
    }

    /// Debug builds are signed with `aps-environment: development`, whose
    /// tokens only exist on the APNs sandbox host. The row remembers which
    /// so the function knows where to send.
    private static var environment: String {
        #if DEBUG
        return "sandbox"
        #else
        return "production"
        #endif
    }

    private static let askedKey = "push.hasAskedOnce"

    private var token: String?
    private var userID: UUID?

    // MARK: - Session

    /// Called once the user is signed in. Asks for permission the first
    /// time an account reaches this point and, from then on, quietly
    /// re-registers — a token can change after a restore or an update, and
    /// only the app is told.
    func link(userID: UUID) async {
        self.userID = userID
        await refreshAuthorization()

        switch authorization {
        case .notDetermined where !UserDefaults.standard.bool(forKey: Self.askedKey):
            await requestPermission()
        case .authorized, .provisional, .ephemeral:
            registerCategories()
            UIApplication.shared.registerForRemoteNotifications()
            await upload()
        default:
            break
        }
    }

    /// Run *before* signing out, while the row is still the caller's to
    /// delete — otherwise this phone would keep buzzing for an account
    /// nobody is signed into.
    func unlink() async {
        defer { userID = nil }
        guard let token else { return }
        _ = try? await Cloud.client.from("push_tokens")
            .delete().eq("token", value: token).execute()
    }

    // MARK: - Permission

    func refreshAuthorization() async {
        authorization = await UNUserNotificationCenter.current()
            .notificationSettings().authorizationStatus
    }

    /// The system prompt. Safe to call from the Settings card as well: iOS
    /// only ever shows it once, and after that this just re-reads the
    /// answer.
    func requestPermission() async {
        UserDefaults.standard.set(true, forKey: Self.askedKey)

        let granted = (try? await UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .sound, .badge])) ?? false

        await refreshAuthorization()
        guard granted else { return }

        registerCategories()
        UIApplication.shared.registerForRemoteNotifications()
        await upload()
    }

    private func registerCategories() {
        let category = UNNotificationCategory(
            identifier: Self.category,
            actions: [],
            intentIdentifiers: [],
            options: [])
        UNUserNotificationCenter.current().setNotificationCategories([category])
    }

    // MARK: - Token

    /// Handed over by the app delegate once APNs answers.
    func adopt(token: String) async {
        self.token = token
        await upload()
    }

    /// Claims this token for the signed-in account. The insert goes
    /// through `register_push_token` rather than the table: a phone the
    /// two of you take turns signing in on keeps one token, and only a
    /// definer function may move a row it does not yet own.
    private func upload() async {
        guard let token, userID != nil else { return }
        do {
            try await Cloud.client
                .rpc("register_push_token", params: RegisterPushToken(
                    token: token,
                    platform: "ios",
                    environment: Self.environment,
                    bundleID: Bundle.main.bundleIdentifier))
                .execute()
        } catch {
            // Nothing to tell the user: notes still arrive on the desk and
            // in the app, this phone just will not be tapped on the
            // shoulder until the next sign-in or launch retries.
        }
    }

    // MARK: - Taps

    func handleTap(deviceID rawDeviceID: String?) {
        tappedDesk = DeskTap(
            deviceID: rawDeviceID.flatMap(UUID.init(uuidString:)),
            at: Date())
    }
}

/// The `register_push_token` arguments, named as the function declares
/// them.
private struct RegisterPushToken: Encodable, Sendable {
    let token: String
    let platform: String
    let environment: String
    let bundleID: String?

    enum CodingKeys: String, CodingKey {
        case token = "p_token"
        case platform = "p_platform"
        case environment = "p_environment"
        case bundleID = "p_bundle_id"
    }
}

/// SwiftUI has no hook for the APNs callbacks, so the app keeps a delegate
/// for exactly these four.
final class DeskAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { await PushRegistrar.shared.adopt(token: hex) }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        // A simulator without a push entitlement, or a phone with no
        // network yet. The next launch tries again.
    }

    /// With the app open the desk screen has already updated itself over
    /// realtime, but the banner is the nice part — so it still shows.
    // `UIApplicationDelegate` puts this class on the main actor, while the
    // notification-centre requirements are not isolated — hence
    // `nonisolated` on both, and an explicit hop for the one line that
    // touches shared state.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        // Only the desk id crosses over — the payload dictionary itself is
        // not `Sendable`, and it is all this needs.
        let deviceID = response.notification.request.content
            .userInfo["device_id"] as? String
        await MainActor.run { PushRegistrar.shared.handleTap(deviceID: deviceID) }
    }
}
