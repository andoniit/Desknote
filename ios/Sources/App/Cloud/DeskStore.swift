import Foundation
import Supabase
import WidgetKit

/// Everything the signed-in screens read from: session, pair, desks, and
/// the current page of history. One store rather than a view model per
/// screen, because the web pages are server components that each re-read
/// the same four things — this is the phone's equivalent of that reload.
@MainActor
@Observable
final class DeskStore {
    enum Phase: Equatable {
        case checking
        case signedOut
        case ready
    }

    private(set) var phase: Phase = .checking
    private(set) var userID: UUID?
    private(set) var email: String?

    private(set) var displayName: String?
    private(set) var partner: PartnerInfo = .none
    private(set) var relationshipMemberCount = 0
    private(set) var unpairState: UnpairState = .none

    /// Desks you can send to: yours plus your partner's.
    private(set) var devices: [DeviceRow] = []
    /// Desks you own — the only ones whose settings you may edit.
    private(set) var ownedDevices: [DeviceRow] = []

    private(set) var history = MessagesAPI.HistoryPage()
    var historyFilter: HistoryFilter = .all {
        didSet {
            guard historyFilter != oldValue else { return }
            historyPage = 1
            Task { await reloadHistory() }
        }
    }
    private(set) var historyPage = 1
    private(set) var isLoadingHistory = false

    /// Sign-in progress and the message under the form.
    private(set) var isAuthenticating = false
    private(set) var authError: String?
    /// Shown after a sign-up when the project still requires confirmation.
    private(set) var awaitingEmailConfirmation = false

    /// The transient line at the bottom of the screen after a send.
    var toast: String?

    private var realtimeTask: Task<Void, Never>?

    var isLinked: Bool { partner.partnerID != nil }
    /// An invite exists but the other person has not entered it yet.
    var isWaitingForPartner: Bool { !isLinked && relationshipMemberCount == 1 }
    var partnerLabel: String { partner.label() }

    /// What to call the user in the dashboard greeting.
    var viewerLabel: String {
        displayName ?? email?.split(separator: "@").first.map(String.init) ?? "love"
    }

    var myDeviceIDs: [UUID] {
        devices.filter { $0.ownerID == userID }.map(\.id)
    }

    var deviceNames: [UUID: String] {
        Dictionary(uniqueKeysWithValues: devices.map { ($0.id, $0.name) })
    }

    // MARK: - Session

    /// Restores a stored session on launch. It is persisted in the App
    /// Group container, so this is usually instant and offline — and the
    /// widget can read the same session to refresh itself.
    func start() async {
        do {
            let session = try await Cloud.client.auth.session
            await adopt(session.user)
        } catch {
            phase = .signedOut
        }
    }

    /// Email + six-digit PIN, exactly as the web's
    /// `signInOrSignUpWithEmailPin`: try to sign in, and fall through to
    /// sign-up when that address has no account yet. The PIN is the
    /// Supabase password — see `.env.example` for the dashboard settings
    /// that make a six-digit numeric one acceptable.
    func signIn(email rawEmail: String, pin rawPin: String, displayName rawName: String) async {
        let email = rawEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let pin = PIN.normalize(rawPin)
        let name = DisplayName.normalize(rawName)

        authError = nil
        awaitingEmailConfirmation = false

        guard !email.isEmpty else {
            authError = "Enter your email address."
            return
        }
        if let message = PIN.validate(pin) {
            authError = message
            return
        }

        isAuthenticating = true
        defer { isAuthenticating = false }

        do {
            let session = try await Cloud.client.auth.signIn(email: email, password: pin)
            await adopt(session.user, preferredName: name)
            return
        } catch {
            let message = error.localizedDescription.lowercased()
            if message.contains("not confirmed") {
                authError = "Confirm your email first (use the link we sent you), then sign in with your PIN."
                return
            }
        }

        do {
            let response = try await Cloud.client.auth.signUp(
                email: email,
                password: pin,
                data: name.map { ["display_name": AnyJSON.string($0)] })

            guard response.session != nil else {
                // Email confirmation is on for this project: the account
                // exists but there is no session until they click through.
                awaitingEmailConfirmation = true
                return
            }
            await adopt(response.user, preferredName: name)
        } catch {
            let message = error.localizedDescription.lowercased()
            if message.contains("already") || message.contains("registered") {
                authError = "That email is already in use. If it is yours, your PIN may be wrong."
            } else {
                authError = error.localizedDescription
            }
        }
    }

    func signOut() async {
        realtimeTask?.cancel()
        realtimeTask = nil
        // Before the session goes: the row is only this user's to delete
        // while they are still signed in, and a phone that kept it would
        // go on buzzing for an account nobody is using.
        await PushRegistrar.shared.unlink()
        try? await Cloud.client.auth.signOut()
        userID = nil
        email = nil
        displayName = nil
        partner = .none
        devices = []
        ownedDevices = []
        history = MessagesAPI.HistoryPage()
        historyPage = 1
        phase = .signedOut
        SharedContainer.writeSnapshots([])
        WidgetCenter.shared.reloadAllTimelines()
    }

    private func adopt(_ user: User, preferredName: String? = nil) async {
        userID = user.id
        email = user.email
        phase = .ready

        if let preferredName {
            _ = try? await ProfileAPI.updateDisplayName(userID: user.id, raw: preferredName)
        }
        await refresh()
        startRealtime()
        // Asks the first time an account gets this far, and quietly
        // re-registers on every launch after that — an APNs token can
        // change under you after a restore or an update.
        await PushRegistrar.shared.link(userID: user.id)
    }

    // MARK: - Loading

    /// Re-reads everything the signed-in screens show. Cheap enough to
    /// call on pull-to-refresh, on realtime events, and after any write.
    func refresh() async {
        guard let userID else { return }

        // The partner lookup gates the device query, so it goes first;
        // the display name is independent and can ride along.
        async let partnerInfo = RelationshipAPI.partner(userID: userID)
        async let ownName = ProfileAPI.displayName(userID: userID)

        partner = await partnerInfo
        displayName = await ownName

        async let paired = DevicesAPI.paired(userID: userID, partnerID: partner.partnerID)
        async let owned = DevicesAPI.owned(userID: userID)
        async let members = isLinked ? 2 : RelationshipAPI.memberCount(userID: userID)
        async let unpair = isLinked ? RelationshipAPI.unpairState(userID: userID) : UnpairState.none

        devices = await paired
        ownedDevices = await owned
        relationshipMemberCount = await members
        unpairState = await unpair

        await publishWidgetSnapshot()
        await reloadHistory()
    }

    /// Hands the home screen widget what it should draw.
    ///
    /// The widget can query on its own, but WidgetKit only wakes it every
    /// so often; pushing here means a note you just sent — or one that
    /// arrived over realtime while the app is open — shows up on the home
    /// screen straight away instead of up to a quarter of an hour later.
    private func publishWidgetSnapshot() async {
        guard let userID else { return }
        let snapshots = await DeskSnapshotAPI.build(
            viewerID: userID, partner: partner, devices: devices)
        SharedContainer.writeSnapshots(snapshots)
        WidgetCenter.shared.reloadAllTimelines()
    }

    func reloadHistory() async {
        guard let userID else { return }
        isLoadingHistory = true
        defer { isLoadingHistory = false }

        do {
            let page = try await MessagesAPI.history(
                viewerID: userID,
                pairedDeviceIDs: devices.map(\.id),
                myDeskDeviceIDs: myDeviceIDs,
                filter: historyFilter,
                page: historyPage)

            // A page can vanish under you when messages are deleted or
            // the filter narrows; snap back rather than showing nothing.
            if page.totalCount > 0 && historyPage > page.pageCount {
                historyPage = page.pageCount
                await reloadHistory()
                return
            }

            history = MessagesAPI.HistoryPage(
                entries: MessagesAPI.attachDeviceNames(page.entries, names: deviceNames),
                page: page.page,
                pageCount: page.pageCount,
                totalCount: page.totalCount)
        } catch {
            history = MessagesAPI.HistoryPage()
        }
    }

    func goToHistoryPage(_ page: Int) async {
        let clamped = max(1, min(page, history.pageCount))
        guard clamped != historyPage else { return }
        historyPage = clamped
        await reloadHistory()
    }

    // MARK: - Writes

    func send(
        content: String,
        toDeviceIDs: [UUID],
        messageType: DeskMessageType = .standard,
        isPinned: Bool? = nil
    ) async throws {
        guard let userID else { throw DeskError("You need to be signed in to send a message.") }
        let message = try await MessagesAPI.send(
            content: content,
            toDeviceIDs: toDeviceIDs,
            devices: devices,
            senderID: userID,
            messageType: messageType,
            isPinned: isPinned)
        toast = message
        await reloadHistory()
    }

    /// Maps "my desk / their desk / both" onto concrete device ids.
    /// Port of `resolveQuickSendDeviceIds`.
    func deviceIDs(for target: QuickSendTarget) throws -> [UUID] {
        guard !devices.isEmpty else { throw DeskError("Pair a desk first.") }
        let mine = devices.filter { $0.ownerID == userID }
        let theirs = partner.partnerID.map { id in devices.filter { $0.ownerID == id } } ?? []

        switch target {
        case .myDesk:
            guard !mine.isEmpty else { throw DeskError("You don’t have a display paired yet.") }
            return mine.map(\.id)
        case .theirDesk:
            guard partner.partnerID != nil else {
                throw DeskError("Link with your partner to send to their desk.")
            }
            guard !theirs.isEmpty else { throw DeskError("Their display isn’t paired yet.") }
            return theirs.map(\.id)
        case .both:
            guard devices.count >= 2 else {
                throw DeskError("Pair two desks to use “both” — or pick yours above.")
            }
            return devices.map(\.id)
        }
    }

    /// The quick-send targets that actually have a desk behind them.
    var availableQuickSendTargets: [(target: QuickSendTarget, label: String)] {
        let mine = devices.filter { $0.ownerID == userID }
        let theirs = partner.partnerID.map { id in devices.filter { $0.ownerID == id } } ?? []
        let names = { (list: [DeviceRow]) in list.map(\.name).joined(separator: " & ") }

        var out: [(QuickSendTarget, String)] = []
        if !mine.isEmpty { out.append((.myDesk, names(mine))) }
        if isLinked && !theirs.isEmpty { out.append((.theirDesk, names(theirs))) }
        if isLinked && !mine.isEmpty && !theirs.isEmpty { out.append((.both, "Both")) }
        return out.map { (target: $0.0, label: $0.1) }
    }

    /// "Your display" / "Their display" / "Shared" under a desk's name.
    func ownerLabel(for device: DeviceRow, short: Bool = false) -> String {
        if device.ownerID == userID { return short ? "Yours" : "Your display" }
        if device.ownerID == partner.partnerID { return short ? "Theirs" : "Their display" }
        return "Shared"
    }

    // MARK: - Realtime

    /// Mirrors the web's `RelationshipRealtime`, widened to the tables the
    /// dashboard shows. Realtime respects RLS, so only rows this user is
    /// allowed to see ever arrive; every event simply triggers the same
    /// reload the pull-to-refresh does.
    private func startRealtime() {
        realtimeTask?.cancel()
        guard let userID else { return }

        realtimeTask = Task { [weak self] in
            let channel = Cloud.client.realtimeV2.channel("desknote-\(userID.uuidString)")
            let tables = ["messages", "notes", "devices", "relationship_members", "relationships", "profiles"]
            let streams = tables.map { table in
                channel.postgresChange(AnyAction.self, schema: "public", table: table)
            }

            do {
                try await channel.subscribeWithError()
            } catch {
                // No live updates on a flaky network; pull-to-refresh and
                // the reload after each write still keep the screens true.
                return
            }

            await withTaskGroup(of: Void.self) { group in
                for stream in streams {
                    group.addTask {
                        for await _ in stream {
                            guard !Task.isCancelled else { return }
                            await self?.refresh()
                        }
                    }
                }
            }

            await channel.unsubscribe()
        }
    }
}
