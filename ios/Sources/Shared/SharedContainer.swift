import Foundation
import Supabase

/// The App Group the app and its widget both reach into.
///
/// Two things live here: the Supabase session, so the widget can query on
/// its own schedule instead of only showing whatever the app last left
/// behind, and the last desk snapshot, so a freshly placed widget has
/// something to draw before its first network round-trip finishes.
enum SharedContainer {
    static let appGroupID = "group.space.desknote"

    /// nil when the App Group is not provisioned — the app still works,
    /// it just falls back to its own private storage and the widget has
    /// nothing to read.
    static var directory: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID)
    }

    private static var snapshotURL: URL? {
        directory?.appendingPathComponent("desk-snapshots.json")
    }

    static func writeSnapshots(_ snapshots: [DeskSnapshot]) {
        guard let snapshotURL else { return }
        guard let data = try? JSONEncoder().encode(snapshots) else { return }
        try? data.write(to: snapshotURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    static func readSnapshots() -> [DeskSnapshot] {
        guard let snapshotURL,
              let data = try? Data(contentsOf: snapshotURL),
              let snapshots = try? JSONDecoder().decode([DeskSnapshot].self, from: data)
        else { return [] }
        return snapshots
    }
}

/// Session storage both targets can read.
///
/// supabase-swift defaults to the Keychain, whose default access group is
/// the bundle id — so the widget, with its own bundle id, would see no
/// session at all and could never fetch. Writing into the App Group
/// container instead is what lets the widget refresh itself.
///
/// The container is sandboxed to this app and its extensions, and the file
/// is written with "until first unlock" protection so a locked phone's
/// widget refresh can still read it. That is weaker than the Keychain, so
/// treat the refresh token accordingly: it is a session for one Supabase
/// project guarded by row level security, not a password.
struct AppGroupLocalStorage: AuthLocalStorage {
    private let fallback = KeychainLocalStorage()

    private func url(for key: String) -> URL? {
        // Keys come from the library and are plain identifiers, but a
        // path separator sneaking in would escape the container.
        let safe = key.replacingOccurrences(of: "/", with: "_")
        return SharedContainer.directory?.appendingPathComponent("auth-\(safe)")
    }

    func store(key: String, value: Data) throws {
        guard let url = url(for: key) else {
            try fallback.store(key: key, value: value)
            return
        }
        try value.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    func retrieve(key: String) throws -> Data? {
        guard let url = url(for: key) else { return try fallback.retrieve(key: key) }
        return try? Data(contentsOf: url)
    }

    func remove(key: String) throws {
        guard let url = url(for: key) else {
            try fallback.remove(key: key)
            return
        }
        try? FileManager.default.removeItem(at: url)
    }
}
