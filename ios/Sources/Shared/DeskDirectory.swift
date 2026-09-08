import Foundation
import Supabase

/// Who the signed-in user is linked with. Port of
/// `lib/relationship/partner.ts`.
struct PartnerInfo: Equatable, Sendable {
    var partnerID: UUID?
    var displayName: String?
    var email: String?

    static let none = PartnerInfo()

    /// What to call them on screen: their chosen name, else their email,
    /// else something generic — the user should always see *something*.
    func label(fallback: String = "your partner") -> String {
        if let name = displayName?.trimmingCharacters(in: .whitespaces), !name.isEmpty {
            return name
        }
        if let email = email?.trimmingCharacters(in: .whitespaces), !email.isEmpty {
            return email
        }
        return fallback
    }
}

/// Reads that both the app and the widget need: who your partner is, and
/// which desks the two of you have. The write side — invites, unpairing,
/// claiming a display — lives in the app target only.
enum RelationshipAPI {
    static var client: SupabaseClient { Cloud.client }

    /// Authoritative "who is my partner?" lookup. `desknote_my_partner` is
    /// SECURITY DEFINER, so it sees past RLS and self-heals
    /// `profiles.partner_id`; the direct queries below are only a fallback
    /// for a project whose migrations have not been applied yet.
    static func partner(userID: UUID) async -> PartnerInfo {
        struct Payload: Decodable {
            let partnerID: UUID?
            let displayName: String?
            let email: String?
            enum CodingKeys: String, CodingKey {
                case partnerID = "partnerId"
                case displayName, email
            }
        }

        do {
            let payload: Payload? = try await client
                .rpc("desknote_my_partner").execute().value
            return PartnerInfo(
                partnerID: payload?.partnerID,
                displayName: payload?.displayName.nonEmpty,
                email: payload?.email.nonEmpty)
        } catch {
            let partnerID = await legacyPartnerID(userID: userID)
            guard let partnerID else { return .none }
            return PartnerInfo(
                partnerID: partnerID,
                displayName: await displayName(of: partnerID),
                email: nil)
        }
    }

    private static func legacyPartnerID(userID: UUID) async -> UUID? {
        struct Membership: Decodable { let relationshipID: UUID }
        struct Member: Decodable { let userID: UUID }
        struct Profile: Decodable { let partnerID: UUID? }

        if let mine: Membership = try? await client.from("relationship_members")
            .select("relationship_id").eq("user_id", value: userID)
            .limit(1).single().execute().value,
           let other: Member = try? await client.from("relationship_members")
            .select("user_id").eq("relationship_id", value: mine.relationshipID)
            .neq("user_id", value: userID).limit(1).single().execute().value {
            return other.userID
        }

        let profile: Profile? = try? await client.from("profiles")
            .select("partner_id").eq("id", value: userID)
            .limit(1).single().execute().value
        return profile?.partnerID
    }

    static func displayName(of userID: UUID) async -> String? {
        let row: ProfileRow? = try? await client.from("profiles")
            .select("id, display_name").eq("id", value: userID)
            .limit(1).single().execute().value
        return row?.displayName.nonEmpty
    }
}

enum DevicesAPI {
    static var client: SupabaseClient { Cloud.client }

    /// Desks visible to this user: their own, plus their partner's once
    /// the pair is linked. Port of `fetchPairedDevicesForUser`.
    static func paired(userID: UUID, partnerID: UUID?) async -> [DeviceRow] {
        let ownerIDs = partnerID.map { [userID, $0] } ?? [userID]
        let rows: [DeviceRow]? = try? await client.from("devices")
            .select(DeviceRow.columns)
            .in("owner_id", values: ownerIDs)
            .order("created_at", ascending: true)
            .execute().value
        return rows ?? []
    }

    /// Desks on your own account. Settings edits are owner-only in RLS,
    /// so the Settings screen lists these rather than the paired set.
    static func owned(userID: UUID) async -> [DeviceRow] {
        let rows: [DeviceRow]? = try? await client.from("devices")
            .select(DeviceRow.columns)
            .eq("owner_id", value: userID)
            .order("created_at", ascending: true)
            .execute().value
        return rows ?? []
    }
}

extension Optional where Wrapped == String {
    /// The trimmed string, or nil when it is missing or all whitespace —
    /// the database stores "no name" as both null and "", and the UI
    /// should not have to care which.
    var nonEmpty: String? {
        guard let trimmed = self?.trimmingCharacters(in: .whitespacesAndNewlines),
              !trimmed.isEmpty
        else { return nil }
        return trimmed
    }
}
