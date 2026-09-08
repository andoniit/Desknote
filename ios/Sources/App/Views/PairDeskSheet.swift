import SwiftUI

/// Claim a display with the six-digit code it shows on first boot.
/// Port of `PairDeviceForm`.
struct PairDeskSheet: View {
    @Environment(DeskStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    @State private var code = ""
    @State private var name = ""
    @State private var location = ""
    @State private var theme = "cream"
    @State private var error: String?
    @State private var success: String?
    @State private var isSaving = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("When the display powers up for the first time, it shows a six-digit code. Enter that code here, name the desk, and choose a look — only your signed-in account can claim it.")
                        .font(.system(size: 13))
                        .foregroundStyle(Palette.muted)
                        .fixedSize(horizontal: false, vertical: true)

                    field("Pairing code", hint: "Six digits, exactly as on the screen.") {
                        TextField("e.g. 482910", text: $code)
                            .keyboardType(.numberPad)
                            .textContentType(.oneTimeCode)
                            .font(.system(size: 17, design: .monospaced))
                            .tracking(4)
                            .onChange(of: code) { _, new in
                                code = DeviceValidation.normalizePairingCode(new)
                            }
                            .deskFieldChrome()
                    }

                    field("Desk name") {
                        TextField("e.g. “Her desk” or “Kitchen nook”", text: $name)
                            .deskFieldChrome()
                    }

                    field("Room or place (optional)") {
                        TextField("e.g. Bedroom, studio apartment", text: $location)
                            .deskFieldChrome()
                    }

                    field("Theme on the display", hint: themeHint) {
                        Picker("Theme", selection: $theme) {
                            ForEach(DeskTheme.all) { option in
                                Text(option.label).tag(option.id)
                            }
                        }
                        .pickerStyle(.menu)
                        .tint(Palette.plum500)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .deskFieldChrome()
                    }

                    if let error { Notice(text: error, tone: .danger) }
                    if let success { Notice(text: success, tone: .success) }

                    Button(isSaving ? "Pairing…" : "Pair this desk", action: claim)
                        .buttonStyle(PrimaryButtonStyle())
                        .disabled(isSaving || code.count != DeviceValidation.pairingDigits
                                  || name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                .padding(20)
            }
            .deskBackground()
            .navigationTitle("Pair a new desk")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }.tint(Palette.plum400)
                }
            }
        }
    }

    private var themeHint: String {
        DeskTheme.all.first { $0.id == theme }?.hint ?? ""
    }

    private func field<Content: View>(
        _ label: String,
        hint: String? = nil,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            SectionLabel(text: label)
            content()
            if let hint, !hint.isEmpty {
                Text(hint)
                    .font(.system(size: 11))
                    .foregroundStyle(Palette.faint)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func claim() {
        error = nil
        success = nil
        isSaving = true

        Task {
            defer { isSaving = false }
            do {
                success = try await DevicesAPI.claim(
                    pairingCode: code, name: name, location: location, theme: theme)
                await store.refresh()
                try? await Task.sleep(for: .seconds(1.2))
                dismiss()
            } catch let failure as DeskError {
                error = failure.message
            } catch {
                self.error = "Something went wrong while saving. Please try again shortly."
            }
        }
    }
}
