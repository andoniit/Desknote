import SwiftUI

/// The web app's design tokens, straight from `tailwind.config.ts`.
///
/// DeskNote is a warm, light, romantic-minimal thing on every surface it
/// has — paper on a desk, not a screen that flips to black at night. The
/// colours are therefore fixed rather than semantic, and every view paints
/// its own ground so the system appearance cannot half-invert it.
enum Palette {
    static let cream = Color(hex: 0xFDFAF6)
    static let cream50 = Color(hex: 0xFFFDFB)
    static let cream200 = Color(hex: 0xF8F1E9)

    static let blush = Color(hex: 0xF5D5D0)
    static let blush50 = Color(hex: 0xFDF4F2)
    static let blush100 = Color(hex: 0xFBE8E4)
    static let blush400 = Color(hex: 0xE29E95)

    static let rose50 = Color(hex: 0xFBEFEF)
    static let rose100 = Color(hex: 0xF4D6D6)
    static let rose200 = Color(hex: 0xEAB3B3)
    static let rose300 = Color(hex: 0xD98A8A)
    static let rose400 = Color(hex: 0xC26767)

    static let plum100 = Color(hex: 0xD9C8CE)
    static let plum200 = Color(hex: 0xB798A3)
    static let plum300 = Color(hex: 0x8B6A77)
    static let plum400 = Color(hex: 0x6B4E57)
    static let plum500 = Color(hex: 0x4E353D)

    static let ash200 = Color(hex: 0xE5DED6)
    static let ash300 = Color(hex: 0xC9BFB3)

    /// Body copy, headings, anything that must simply be read.
    static let ink = plum500
    /// Supporting lines under a heading.
    static let muted = plum300
    /// Labels, counters, hints — the quietest readable tone.
    static let faint = plum200

    /// The swatch a desk accent id stands for.
    static func accent(_ id: String?) -> Color {
        switch id {
        case "rose": return rose400
        case "blush": return blush400
        case "plum": return plum400
        case "sage": return Color(hex: 0x8FA894)
        case "cream": return ash300
        default: return rose300
        }
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255)
    }
}

extension Font {
    /// Fraunces on the web; the system serif is its closest native
    /// stand-in and costs no bundled font file.
    static func display(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .serif)
    }

    /// The bundled Material Design Icons face, which is the only way the
    /// desk stickers render as anything but empty boxes — they live in a
    /// private use area no system font covers.
    static func mdi(_ size: CGFloat) -> Font {
        .custom("MaterialDesignIcons", size: size)
    }
}

// MARK: - Building blocks

/// The white, softly shadowed panel the whole web UI is built from.
struct DeskCard<Content: View>: View {
    var padding: CGFloat = 16
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(padding)
            .background(Color.white.opacity(0.85))
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(Palette.ash200.opacity(0.7), lineWidth: 1))
            .shadow(color: Palette.plum400.opacity(0.08), radius: 14, y: 6)
    }
}

/// Title + subtitle strip at the top of a panel.
struct PanelHeader: View {
    let title: String
    var subtitle: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.display(17, weight: .semibold))
                .foregroundStyle(Palette.ink)
            if let subtitle {
                Text(subtitle)
                    .font(.system(size: 13))
                    .foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The small tracked-out caps label above a section.
struct SectionLabel: View {
    let text: String

    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .medium))
            .tracking(1.6)
            .foregroundStyle(Palette.faint)
    }
}

/// The page's own title block.
struct PageHeader<Title: View>: View {
    private let eyebrow: String
    private let description: String?
    private let title: Title

    init(eyebrow: String, description: String? = nil, @ViewBuilder title: () -> Title) {
        self.eyebrow = eyebrow
        self.description = description
        self.title = title()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: eyebrow)
            title
                .font(.display(28))
                .foregroundStyle(Palette.ink)
            if let description {
                Text(description)
                    .font(.system(size: 14))
                    .foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// An inline message: a soft note by default, red when something failed.
struct Notice: View {
    enum Tone { case info, danger, success }

    let text: String
    var tone: Tone = .info

    var body: some View {
        Text(text)
            .font(.system(size: 13))
            .foregroundStyle(foreground)
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(background)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var foreground: Color {
        switch tone {
        case .info: return Palette.plum400
        case .danger: return Palette.rose400
        case .success: return Palette.plum500
        }
    }

    private var background: Color {
        switch tone {
        case .info: return Palette.blush50
        case .danger: return Palette.rose50
        case .success: return Palette.cream200
        }
    }
}

/// Nothing here yet, and what to do about it.
struct EmptyState: View {
    let title: String
    let description: String
    var actionLabel: String?
    var action: (() -> Void)?

    var body: some View {
        DeskCard(padding: 20) {
            VStack(alignment: .leading, spacing: 8) {
                Text(title)
                    .font(.display(16, weight: .semibold))
                    .foregroundStyle(Palette.ink)
                Text(description)
                    .font(.system(size: 13))
                    .foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
                if let actionLabel, let action {
                    Button(actionLabel, action: action)
                        .buttonStyle(SecondaryButtonStyle())
                        .padding(.top, 4)
                }
            }
        }
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(Palette.cream)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(isEnabled ? Palette.plum500 : Palette.plum200)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .medium))
            .foregroundStyle(isEnabled ? Palette.plum500 : Palette.plum200)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
            .background(Color.white.opacity(0.9))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Palette.rose100, lineWidth: 1))
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

/// The cream wash every signed-in screen sits on.
struct DeskBackground: ViewModifier {
    func body(content: Content) -> some View {
        content.background(
            LinearGradient(
                colors: [Palette.cream50, Palette.cream, Palette.blush50],
                startPoint: .top, endPoint: .bottom)
            .ignoresSafeArea())
    }
}

extension View {
    func deskBackground() -> some View { modifier(DeskBackground()) }

    /// A text field dressed like the web's `.input`.
    func deskFieldChrome() -> some View {
        padding(.horizontal, 13)
            .padding(.vertical, 12)
            .background(Color.white.opacity(0.85))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Palette.ash200.opacity(0.8), lineWidth: 1))
    }
}
