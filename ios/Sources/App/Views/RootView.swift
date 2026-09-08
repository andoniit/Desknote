import SwiftUI

/// Session gate and the four tabs, matching the web's nav:
/// Desk / Pair / Devices / Settings.
struct RootView: View {
    @Environment(DeskStore.self) private var store

    var body: some View {
        switch store.phase {
        case .checking:
            ZStack {
                Color.clear.deskBackground()
                ProgressView().tint(Palette.rose300)
            }
        case .signedOut:
            LoginView()
        case .ready:
            SignedInTabs()
        }
    }
}

private struct SignedInTabs: View {
    @Environment(DeskStore.self) private var store
    private let push = PushRegistrar.shared
    @State private var tab = Tab.desk

    enum Tab { case desk, pair, devices, settings }

    var body: some View {
        TabView(selection: $tab) {
            DashboardView()
                .tabItem { Label("Desk", systemImage: "heart") }
                .tag(Tab.desk)
            RelationshipView()
                .tabItem { Label("Pair", systemImage: "link") }
                .tag(Tab.pair)
            DevicesView()
                .tabItem { Label("Devices", systemImage: "rectangle.on.rectangle") }
                .tag(Tab.devices)
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
                .tag(Tab.settings)
        }
        // Tapping the widget lands on the desk, showing the same message
        // it was displaying, and refreshes in case it had gone stale.
        .onOpenURL { url in
            guard url.scheme == "desknote", url.host == "desk" else { return }
            tab = .desk
            Task { await store.refresh() }
        }
        // Tapping the notification does the same thing the widget does:
        // the desk it came from, freshly loaded.
        .onChange(of: push.tappedDesk) { _, tap in
            guard tap != nil else { return }
            tab = .desk
            Task { await store.refresh() }
        }
        // A send confirms with the same line the web toasts.
        .overlay(alignment: .bottom) {
            if let toast = store.toast {
                DeskText(content: toast, size: 13, color: Palette.cream)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 11)
                    .background(Palette.plum500)
                    .clipShape(Capsule())
                    .shadow(color: Palette.plum500.opacity(0.3), radius: 12, y: 4)
                    .padding(.bottom, 64)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .task(id: toast) {
                        try? await Task.sleep(for: .seconds(3))
                        store.toast = nil
                    }
            }
        }
        .animation(.easeOut(duration: 0.25), value: store.toast)
    }
}
