import SwiftUI

/// Where a note goes: their desk, mine, or both. One choice shared by the
/// composer and the little taps, so it is picked once, at the top.
struct DestinationPicker: View {
    let choices: [(target: QuickSendTarget, label: String)]
    @Binding var selection: QuickSendTarget

    var body: some View {
        HStack(spacing: 3) {
            ForEach(choices, id: \.target) { choice in
                let selected = choice.target == selection
                Button {
                    withAnimation(.snappy(duration: 0.2)) { selection = choice.target }
                } label: {
                    Text(choice.label)
                        .font(.system(size: 13, weight: selected ? .semibold : .regular))
                        .foregroundStyle(selected ? Palette.ink : Palette.muted)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background {
                            if selected {
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .fill(Color.white)
                                    .shadow(color: Palette.plum400.opacity(0.1), radius: 3, y: 1)
                            }
                        }
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
        .padding(3)
        .background(Palette.cream200)
        .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
        .sensoryFeedback(.selection, trigger: selection)
    }
}
