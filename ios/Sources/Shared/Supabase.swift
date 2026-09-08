import Foundation
import Supabase

/// The Supabase client, configured from the bundled `supabase.json` that
/// `configure.sh` generates from the web app's `.env.local`.
///
/// The phone and the web talk to the same project through the same
/// publishable key, so a note written on either shows up on the other.
/// Row level security scopes every query to the signed-in user — the
/// queries here carry no user filters of their own, exactly like the
/// server actions they were ported from.
enum Cloud {
    struct Config: Decodable {
        let url: String
        let anonKey: String
    }

    static let client: SupabaseClient = {
        guard let fileURL = Bundle.main.url(forResource: "supabase", withExtension: "json"),
              let data = try? Data(contentsOf: fileURL),
              let config = try? JSONDecoder().decode(Config.self, from: data),
              let url = URL(string: config.url)
        else {
            fatalError("supabase.json missing or malformed — run ./configure.sh")
        }

        return SupabaseClient(
            supabaseURL: url,
            supabaseKey: config.anonKey,
            options: SupabaseClientOptions(
                db: SupabaseClientOptions.DatabaseOptions(decoder: decoder),
                // The session goes in the App Group rather than the
                // Keychain so the widget extension can read it and
                // refresh on its own. See `AppGroupLocalStorage`.
                auth: SupabaseClientOptions.AuthOptions(storage: AppGroupLocalStorage())
            )
        )
    }()

    /// Postgres columns are snake_case and the Swift models are camelCase,
    /// so the conversion happens here once rather than in `CodingKeys` on
    /// every row type.
    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        // `timestamptz` comes back with a variable number of fractional
        // digits and either "+00:00" or "Z", which no single built-in
        // strategy covers — hence parsing it by hand.
        decoder.dateDecodingStrategy = .custom { decoder in
            let raw = try decoder.singleValueContainer().decode(String.self)
            guard let date = PostgresTimestamp.parse(raw) else {
                throw DecodingError.dataCorrupted(.init(
                    codingPath: decoder.codingPath,
                    debugDescription: "Unrecognised timestamp: \(raw)"))
            }
            return date
        }
        return decoder
    }()
}

/// Parses the `timestamptz` shapes PostgREST hands back.
enum PostgresTimestamp {
    // Formatting is read-only here and `date(from:)` is thread-safe, so
    // one shared formatter is fine — building one per row is not.
    nonisolated(unsafe) private static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    nonisolated(unsafe) private static let whole: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    static func parse(_ raw: String) -> Date? {
        // Postgres emits up to six fractional digits; ISO8601DateFormatter
        // only accepts three, so the tail is trimmed before parsing.
        var value = raw
        if let dot = value.firstIndex(of: "."),
           let tzStart = value[dot...].firstIndex(where: { $0 == "+" || $0 == "-" || $0 == "Z" }) {
            let digits = value[value.index(after: dot)..<tzStart]
            if digits.count > 3 {
                let keep = value.index(dot, offsetBy: 4)
                value.replaceSubrange(keep..<tzStart, with: "")
            }
        }
        return withFraction.date(from: value) ?? whole.date(from: value)
    }
}
