import SwiftUI

/// Email + six-digit PIN, the same single form the web `/login` shows:
/// one submit that signs in, or creates the account if the address is new.
struct LoginView: View {
    @Environment(DeskStore.self) private var store

    @AppStorage("dn_returning_login") private var hasSignedInBefore = false
    @State private var email = ""
    @State private var pin = ""
    @State private var displayName = ""
    @FocusState private var focus: Field?

    private enum Field { case email, pin, name }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Spacer(minLength: 48)

                VStack(alignment: .leading, spacing: 10) {
                    Circle()
                        .fill(LinearGradient(
                            colors: [Palette.rose300, Palette.plum300],
                            startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 34, height: 34)
                    Text("DeskNote")
                        .font(.display(32, weight: .semibold))
                        .foregroundStyle(Palette.ink)
                    Text("Two desks, one conversation. Sign in with your email and six-digit PIN — we make the account if you are new.")
                        .font(.system(size: 14))
                        .foregroundStyle(Palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.bottom, 26)

                DeskCard(padding: 18) {
                    VStack(alignment: .leading, spacing: 12) {
                        TextField("you@example.com", text: $email)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .focused($focus, equals: .email)
                            .submitLabel(.next)
                            .onSubmit { focus = .pin }
                            .deskFieldChrome()

                        SecureField("Six-digit PIN", text: $pin)
                            .textContentType(.password)
                            .keyboardType(.numberPad)
                            .focused($focus, equals: .pin)
                            .onChange(of: pin) { _, new in
                                pin = PIN.normalize(new)
                            }
                            .deskFieldChrome()

                        // Only asked on a first visit — after that the
                        // name is already on the profile, and the web
                        // hides this field for the same reason.
                        if !hasSignedInBefore {
                            TextField("Your name (optional)", text: $displayName)
                                .textContentType(.name)
                                .focused($focus, equals: .name)
                                .submitLabel(.go)
                                .onSubmit(submit)
                                .deskFieldChrome()
                            Text("Your partner sees this on their desk and in history.")
                                .font(.system(size: 11))
                                .foregroundStyle(Palette.faint)
                        }

                        if let error = store.authError {
                            Notice(text: error, tone: .danger)
                        }

                        if store.awaitingEmailConfirmation {
                            Notice(
                                text: "Almost there — check your inbox and click the confirmation link, then come back and sign in with your PIN.",
                                tone: .info)
                        }

                        Button(action: submit) {
                            HStack(spacing: 8) {
                                if store.isAuthenticating {
                                    ProgressView().tint(Palette.cream)
                                }
                                Text(store.isAuthenticating ? "Signing in…" : "Continue")
                            }
                        }
                        .buttonStyle(PrimaryButtonStyle())
                        .disabled(!canSubmit)
                        .padding(.top, 2)
                    }
                }

                Text("Your PIN is six numbers — it is stored as your account password, so pick something only the two of you would guess.")
                    .font(.system(size: 12))
                    .foregroundStyle(Palette.faint)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 14)

                Spacer(minLength: 40)
            }
            .padding(.horizontal, 22)
        }
        .scrollDismissesKeyboard(.interactively)
        .deskBackground()
    }

    private var canSubmit: Bool {
        !email.trimmingCharacters(in: .whitespaces).isEmpty
            && pin.count == PIN.length
            && !store.isAuthenticating
    }

    private func submit() {
        guard canSubmit else { return }
        focus = nil
        Task {
            await store.signIn(email: email, pin: pin, displayName: displayName)
            if store.phase == .ready { hasSignedInBefore = true }
        }
    }
}
