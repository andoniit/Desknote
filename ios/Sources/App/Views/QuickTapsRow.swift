import SwiftUI

/// The presets, one tap each, to wherever the composer's destination points.
struct QuickTapsRow: View {
    @Environment(DeskStore.self) private var store
    let destination: QuickSendTarget

    @State private var sendingID: String?
    @State private var error: String?
    @State private var sentCount = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 5) {
                SectionLabel(text: "Little taps")
                if let label = store.destinationChoices.first(where: { $0.target == destination })?.label {
                    Text("to \(label)")
                        .font(.system(size: 11))
                        .foregroundStyle(Palette.faint)
                }
            }
            .padding(.horizontal, 20)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(QuickSendPreset.all) { preset in
                        Button { send(preset) } label: {
                            DeskText(content: preset.text, size: 14, weight: .medium, color: Palette.plum500)
                                .lineLimit(1)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 10)
                                .background(Color.white.opacity(0.9))
                                .clipShape(Capsule())
                                .overlay(Capsule().stroke(Palette.rose100.opacity(0.9), lineWidth: 1))
                                .opacity(sendingID == preset.id ? 0.45 : 1)
                        }
                        .buttonStyle(.plain)
                        .disabled(sendingID != nil)
                    }
                }
                .padding(.horizontal, 20)
            }
            .sensoryFeedback(.success, trigger: sentCount)

            if let error {
                Notice(text: error, tone: .danger).padding(.horizontal, 20)
            }
        }
    }

    private func send(_ preset: QuickSendPreset) {
        error = nil
        do {
            let deviceIDs = try store.deviceIDs(for: destination)
            sendingID = preset.id
            Task {
                defer { sendingID = nil }
                do {
                    try await store.send(content: preset.text, toDeviceIDs: deviceIDs, messageType: .quickSend)
                    sentCount += 1
                } catch let failure as DeskError {
                    error = failure.message
                } catch {
                    self.error = "That didn't send. Try again in a moment."
                }
            }
        } catch let failure as DeskError {
            error = failure.message
        } catch {
            self.error = "That didn't send. Try again in a moment."
        }
    }
}
