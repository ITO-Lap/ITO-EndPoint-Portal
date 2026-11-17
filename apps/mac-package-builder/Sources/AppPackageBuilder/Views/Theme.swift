import SwiftUI

/// Shared design tokens for the "modern AI" light theme: a vibrant
/// indigo/cyan accent over a light, minimal surface. Views should pull
/// colors, spacing, and the card/button styles from here rather than
/// hardcoding system colors, so the look stays consistent as new screens
/// are added.
enum AppTheme {
    // MARK: Accent

    /// Primary vibrant accent (indigo). Also applied as the app-wide `.tint`
    /// in `AppPackageBuilderApp`, so standard controls (`.borderedProminent`
    /// buttons, toggles, selection highlights) pick it up automatically.
    static let accent = Color(red: 0.388, green: 0.400, blue: 0.945)
    /// Secondary accent (cyan) used only for the two-color hero gradient.
    static let accentSecondary = Color(red: 0.133, green: 0.827, blue: 0.933)

    static let accentGradient = LinearGradient(
        colors: [accent, accentSecondary],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    // MARK: Surfaces

    static let canvas = Color(nsColor: .windowBackgroundColor)
    static let surface = Color(nsColor: .controlBackgroundColor)
    static let border = Color(nsColor: .separatorColor).opacity(0.5)

    // MARK: Semantic status

    static let success = Color.green
    static let warning = Color.orange
    static let danger = Color.red

    // MARK: Spacing & radius

    static let radiusS: CGFloat = 8
    static let radiusM: CGFloat = 10
    static let radiusL: CGFloat = 14

    // MARK: Typography

    static let eyebrowFont = Font.system(size: 10, weight: .bold, design: .rounded)
    static let titleFont = Font.system(size: 26, weight: .bold, design: .rounded)
}

// MARK: - Card surface

private struct CardSurface: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(AppTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusM, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: AppTheme.radiusM, style: .continuous)
                    .strokeBorder(AppTheme.border, lineWidth: 0.7)
            }
            .shadow(color: .black.opacity(0.04), radius: 10, y: 3)
    }
}

extension View {
    /// The rounded, softly-shadowed card surface used throughout the app
    /// (`SectionCard`, stat tiles, list rows) instead of a flat background.
    func cardSurface() -> some View { modifier(CardSurface()) }
}

// MARK: - Screen header

/// Standard header for a top-level screen: a small bold "eyebrow" label,
/// a large rounded title, and a secondary subtitle, with room for trailing
/// content (a date, status, or action). Keeps typography consistent across
/// screens that previously each rolled their own `.largeTitle`/`.title2`.
struct ScreenHeader<Trailing: View>: View {
    let eyebrow: String?
    let title: String
    let subtitle: String?
    @ViewBuilder var trailing: Trailing

    init(
        eyebrow: String? = nil,
        title: String,
        subtitle: String? = nil,
        @ViewBuilder trailing: () -> Trailing = { EmptyView() }
    ) {
        self.eyebrow = eyebrow
        self.title = title
        self.subtitle = subtitle
        self.trailing = trailing()
    }

    var body: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 5) {
                if let eyebrow {
                    Text(eyebrow)
                        .font(AppTheme.eyebrowFont)
                        .foregroundStyle(AppTheme.accent)
                }
                Text(title)
                    .font(AppTheme.titleFont)
                if let subtitle {
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 12)
            trailing
        }
    }
}

// MARK: - Button styles

/// Gradient-filled primary action button (the main "do the thing" button
/// on a screen), used instead of the flat `.borderedProminent` tint fill.
struct PrimaryGradientButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .semibold))
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(AppTheme.accentGradient)
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusS, style: .continuous))
            .opacity(configuration.isPressed ? 0.85 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}

extension ButtonStyle where Self == PrimaryGradientButtonStyle {
    static var primaryGradient: PrimaryGradientButtonStyle { PrimaryGradientButtonStyle() }
}
