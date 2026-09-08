import SwiftUI

@main
struct DeskNoteApp: App {
    // SwiftUI has no hook for the APNs callbacks, so the app keeps a
    // delegate for those — see `PushNotifications.swift`.
    @UIApplicationDelegateAdaptor(DeskAppDelegate.self) private var appDelegate
    @State private var store = DeskStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .task { await store.start() }
                // The desk is warm paper in every light; the app follows
                // it rather than the system's idea of night.
                .preferredColorScheme(.light)
                .tint(Palette.rose300)
        }
    }
}
