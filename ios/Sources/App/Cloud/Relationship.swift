import Foundation
import Supabase

/// Whether an unpair is pending, and who asked for it.
enum UnpairState: Equatable, Sendable {
    case none
    case requestedByMe
    case requestedByPartner
}

extension RelationshipAPI {
    /// How many people are in the caller's relationship. One means the
    /// invite has been created but nobody has joined yet.
    static func memberCount(userID: UUID) async -> Int {
        struct Membership: Decodable { let relationshipID: UUID }
        guard let mine: Membership = try? await client.from("relationship_members")
            .select("relationship_id").eq("user_id", value: userID)
            .limit(1).single().execute().value
        else { return 0 }

        let response = try? await client.from("relationship_members")
            .select("user_id", head: true, count: .exact)
            .eq("relationship_id", value: mine.relationshipID)
            .execute()
        return response?.count ?? 0
    }

    static func unpairState(userID: UUID) async -> UnpairState {
        struct Membership: Decodable { let relationshipID: UUID }
        struct Relationship: Decodable { let unpairRequestedBy: UUID? }

        guard let mine: Membership = try? await client.from("relationship_members")
            .select("relationship_id").eq("user_id", value: userID)
            .limit(1).single().execute().value,
              let row: Relationship = try? await client.from("relationships")
            .select("unpair_requested_by").eq("id", value: mine.relationshipID)
            .limit(1).single().execute().value,
              let requester = row.unpairRequestedBy
        else { return .none }

        return requester == userID ? .requestedByMe : .requestedByPartner
    }

    // MARK: - Invites

    struct Invite: Equatable, Sendable {
        let code: String
        let expiresAt: Date
    }

    /// Port of `createInviteAction`. `invitedEmail` locks the code to one
    /// address; nil leaves it open to whoever holds the code.
    static func createInvite(invitedEmail: String?) async throws -> Invite {
        struct Params: Encodable { let invited_email: String? }
        struct Row: Decodable { let code: String; let expiresAt: Date }

        let normalized = invitedEmail.flatMap { raw -> String? in
            let email = InviteValidation.normalizeEmail(raw)
            return email.isEmpty ? nil : email
        }
        if let normalized, !InviteValidation.isValidEmail(normalized) {
            throw DeskError("That email does not look quite right — double-check the address.")
        }

        do {
            // The RPC returns a one-row set, so the response is an array
            // even though only the first row matters.
            let rows: [Row] = try await client
                .rpc("desknote_create_invite", params: Params(invited_email: normalized))
                .execute().value
            guard let row = rows.first else {
                throw DeskError("We could not create an invite just now. Please try again in a moment.")
            }
            return Invite(code: row.code, expiresAt: row.expiresAt)
        } catch let error as DeskError {
            throw error
        } catch {
            throw DeskError(createInviteMessage(for: error))
        }
    }

    private static func createInviteMessage(for error: Error) -> String {
        let m = error.localizedDescription.lowercased()
        if m.contains("already_linked") {
            return "You are already linked with someone. DeskNote is built for one pair at a time."
        }
        if m.contains("invalid_email") {
            return "That email does not look quite right — double-check the address."
        }
        if m.contains("not_authenticated") {
            return "You need to be signed in to create an invite."
        }
        if m.contains("could not find the function") || m.contains("pgrst202") {
            return "Pairing is not set up on this project yet. Apply the Supabase migrations that define desknote_create_invite, then try again."
        }
        if m.contains("permission denied") || m.contains("42501") {
            return "The database blocked this invite. Check that migrations ran and the desknote_create_invite RPC is granted to the authenticated role."
        }
        return "We could not create an invite just now. Please try again in a moment."
    }

    private static let joinErrors: [String: String] = [
        "not_signed_in": "Sign in first, then come back to enter your code.",
        "invalid_code": "That code looks too short. Invite codes are ten letters or numbers.",
        "code_not_found": "We could not find that code. Ask your partner to send a fresh one, or check for typos.",
        "code_expired": "This invite has expired. Ask your partner to create a new code.",
        "own_invite": "That is your own invite — share it with your partner instead.",
        "already_in_relationship": "You are already part of a pair. Leave that relationship before joining another, or ask for help if this is unexpected.",
        "email_mismatch": "This invite was sent to a specific email. Sign in with that same address, then try again.",
        "relationship_full": "This invite was already used. Ask your partner for a new code if you still need to link.",
    ]

    /// Port of `joinInviteAction`. Returns the line to show on success.
    static func joinInvite(code raw: String) async throws -> String {
        struct Params: Encodable { let p_code: String }
        struct Payload: Decodable {
            let ok: Bool?
            let error: String?
            let alreadyMember: Bool?
            enum CodingKeys: String, CodingKey {
                case ok, error
                case alreadyMember = "already_member"
            }
        }

        guard InviteValidation.normalizeCode(raw).count >= 6 else {
            throw DeskError(joinErrors["invalid_code"]!)
        }

        let payload: Payload?
        do {
            payload = try await client
                .rpc("desknote_join_invite", params: Params(p_code: raw))
                .execute().value
        } catch {
            throw DeskError("Something went wrong while linking. Please try again.")
        }

        guard payload?.ok == true else {
            let key = payload?.error ?? "unknown"
            throw DeskError(joinErrors[key] ?? joinErrors["code_not_found"]!)
        }

        if payload?.alreadyMember == true {
            return "You are already linked in this relationship — you are all set."
        }
        return "You are linked. Your desks, devices, and notes are now shared between the two of you."
    }

    private static let unpairErrors: [String: String] = [
        "not_signed_in": "Sign in and come back — we could not verify your account.",
        "not_in_pair": "You are not paired right now, so there is nothing to unpair.",
        "pair_incomplete": "Your pair is still waiting for the other person to join. Delete the invite from Share above if you need a reset.",
    ]

    /// Port of `toggleUnpairAction`. Unpairing is two-sided: the first tap
    /// requests it, tapping again cancels, and the partner's tap dissolves
    /// the pair. Returns the line to show.
    static func toggleUnpair() async throws -> String {
        struct Payload: Decodable {
            let ok: Bool?
            let error: String?
            let state: String?
        }

        let payload: Payload?
        do {
            payload = try await client.rpc("desknote_toggle_unpair").execute().value
        } catch {
            let m = error.localizedDescription.lowercased()
            if m.contains("could not find the function") || m.contains("pgrst202") {
                throw DeskError("Unpair is not set up on this project yet. Apply the latest Supabase migrations, then try again.")
            }
            throw DeskError("We could not update the pair right now. Please try again.")
        }

        guard payload?.ok == true else {
            let key = payload?.error ?? "unknown"
            throw DeskError(unpairErrors[key] ?? "Something went wrong. Please try again.")
        }

        switch payload?.state ?? "requested" {
        case "cancelled": return "We cancelled your unpair request. You are still linked."
        case "dissolved": return "You are unpaired. Notes and devices are no longer shared."
        default: return "Unpair requested. We will wait for your partner to confirm."
        }
    }
}
