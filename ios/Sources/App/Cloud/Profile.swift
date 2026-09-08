import Foundation
import Supabase

enum ProfileAPI {
    private static let client = Cloud.client

    /// The caller's own display name, or nil when it has never been set.
    static func displayName(userID: UUID) async -> String? {
        let row: ProfileRow? = try? await client.from("profiles")
            .select("id, display_name").eq("id", value: userID)
            .limit(1).single().execute().value
        return row?.displayName.nonEmpty
    }

    /// Port of `updateDisplayNameAction`. An empty name clears the column,
    /// which is what puts "your partner" back on the other side.
    static func updateDisplayName(userID: UUID, raw: String) async throws -> (String, String?) {
        guard raw.trimmingCharacters(in: .whitespacesAndNewlines).count
                <= DisplayName.maxLength else {
            throw DeskError("Please keep it under \(DisplayName.maxLength) characters.")
        }

        let name = DisplayName.normalize(raw)
        do {
            try await client.from("profiles")
                .upsert(ProfileUpsert(id: userID, displayName: name), onConflict: "id")
                .execute()
        } catch {
            throw DeskError("We could not save your name just now. Please try again.")
        }

        let message = name != nil
            ? "Saved. Your partner will see this name."
            : "Cleared. You will appear as “your partner” until you add a name."
        return (message, name)
    }
}
