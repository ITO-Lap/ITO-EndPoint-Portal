import SwiftUI

struct StatusBadge: View {
    let status: RequirementStatus
    let text: String

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: icon).foregroundStyle(color)
            Text(text).font(.caption).bold().foregroundStyle(color)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(color.opacity(0.12))
        .clipShape(Capsule())
        .accessibilityElement(children: .combine)
    }

    private var icon: String {
        switch status {
        case .pass: return "checkmark.circle.fill"
        case .warning: return "exclamationmark.triangle.fill"
        case .fail: return "xmark.circle.fill"
        case .checking: return "clock.fill"
        }
    }

    private var color: Color {
        switch status {
        case .pass: return AppTheme.success
        case .warning: return AppTheme.warning
        case .fail: return AppTheme.danger
        case .checking: return .secondary
        }
    }
}

struct RequirementRow: View {
    let check: RequirementCheck

    var body: some View {
        HStack {
            Text(check.name).font(.subheadline)
            Spacer()
            Text(check.detail)
                .font(.caption)
                .foregroundStyle(color)
                .lineLimit(1)
                .truncationMode(.tail)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(check.name): \(check.status == .pass ? "available" : check.status == .fail ? "failing" : "warning") — \(check.detail)")
        .overlay(alignment: .leading) {
            Circle().fill(color).frame(width: 6, height: 6).offset(x: -14)
        }
    }

    private var color: Color {
        switch check.status {
        case .pass: return AppTheme.success
        case .warning: return AppTheme.warning
        case .fail: return AppTheme.danger
        case .checking: return .secondary
        }
    }
}

struct SectionCard<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                RoundedRectangle(cornerRadius: 1.5)
                    .fill(AppTheme.accentGradient)
                    .frame(width: 3, height: 16)
                Text(title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.primary)
                Spacer(minLength: 0)
            }
            content
        }
        .padding(15)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }
}
