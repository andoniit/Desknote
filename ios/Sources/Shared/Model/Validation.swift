import Foundation

/// Email + six-digit PIN, stored as the Supabase password.
/// Port of `lib/auth/pin.ts`.
enum PIN {
    static let length = 6

    /// Digits only, at most six — the field itself is what keeps typing sane.
    static func normalize(_ raw: String) -> String {
        String(raw.filter(\.isNumber).prefix(length))
    }

    /// `nil` when valid, otherwise a short line to show under the field.
    static func validate(_ digits: String) -> String? {
        digits.count == length ? nil : "Use exactly \(length) numbers for your PIN."
    }
}

/// Port of `lib/devices/validation.ts`.
enum DeviceValidation {
    static let pairingDigits = 6
    static let nameMax = 48
    static let locationMax = 64

    static func normalizePairingCode(_ raw: String) -> String {
        String(raw.filter(\.isNumber).prefix(pairingDigits))
    }

    static func validatePairingCode(_ raw: String) -> String? {
        normalizePairingCode(raw).count == pairingDigits
            ? nil
            : "Enter all \(pairingDigits) digits from the display."
    }

    static func validateName(_ raw: String) -> String? {
        let t = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty { return "Give this desk a short name — for example “Her desk”." }
        if t.count > nameMax { return "Keep the name under \(nameMax) characters." }
        return nil
    }

    static func validateLocation(_ raw: String) -> String? {
        let t = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.count > locationMax {
            return "Location can be at most \(locationMax) characters."
        }
        return nil
    }
}

/// Port of `lib/relationship/validation.ts`.
enum InviteValidation {
    /// Invite codes are shown with separators; strip anything that is not
    /// a letter or digit so a pasted "AB3D-9F2K" still matches.
    static func normalizeCode(_ raw: String) -> String {
        raw.filter { $0.isLetter || $0.isNumber }.uppercased()
    }

    static func normalizeEmail(_ raw: String) -> String {
        raw.trimmingCharacters(in: .whitespaces).lowercased()
    }

    static func isValidEmail(_ raw: String) -> Bool {
        let e = normalizeEmail(raw)
        guard let at = e.firstIndex(of: "@"), at != e.startIndex else { return false }
        let domain = e[e.index(after: at)...]
        return !domain.isEmpty
            && !domain.contains("@")
            && domain.contains(".")
            && !domain.hasSuffix(".")
            && !e.contains(" ")
    }
}

/// Port of `lib/profile/display-name.ts`.
enum DisplayName {
    static let maxLength = 40

    /// Collapses runs of whitespace, trims, clamps. `nil` when nothing
    /// meaningful is left, which is what clears the column.
    static func normalize(_ raw: String?) -> String? {
        guard let raw else { return nil }
        let collapsed = raw.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        if collapsed.isEmpty { return nil }
        return String(collapsed.prefix(maxLength))
    }
}
