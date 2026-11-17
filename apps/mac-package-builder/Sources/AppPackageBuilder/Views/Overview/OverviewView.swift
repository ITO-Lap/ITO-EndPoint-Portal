import SwiftUI

struct OverviewView: View {
    @StateObject private var historyViewModel = BuildHistoryViewModel()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                ScreenHeader(
                    eyebrow: "WORKSPACE",
                    title: "Overview",
                    subtitle: "Your packaging activity and environment at a glance."
                ) {
                    Text(Date.now.formatted(date: .complete, time: .omitted))
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                }

                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    statTile("TOTAL BUILDS", "\(historyViewModel.records.count)", "shippingbox", AppTheme.accent)
                    statTile("SUCCESSFUL", "\(historyViewModel.records.filter { $0.result == .success }.count)", "checkmark.circle", AppTheme.success)
                    statTile("FAILED", "\(historyViewModel.records.filter { $0.result == .failed }.count)", "xmark.circle", AppTheme.danger)
                    statTile("HOMEBREW", HomebrewService().locateBrewExecutable() != nil ? "Ready" : "Missing", "mug", AppTheme.warning)
                }

                SectionCard(title: "Recent Builds") {
                    if historyViewModel.records.isEmpty {
                        ContentUnavailableView {
                            Label("No builds yet", systemImage: "shippingbox")
                        } description: {
                            Text("Completed package builds will appear here.")
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                    } else {
                        VStack(spacing: 0) {
                            ForEach(Array(historyViewModel.records.prefix(6).enumerated()), id: \.element.id) { index, record in
                                if index > 0 { Divider().padding(.leading, 38) }
                                buildRow(record)
                            }
                        }
                    }
                }
            }
            .padding(26)
            .frame(maxWidth: 1240, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .onAppear { historyViewModel.reload() }
    }

    private func buildRow(_ record: BuildHistoryRecord) -> some View {
        HStack(spacing: 11) {
            Image(systemName: record.result == .success ? "checkmark" : record.result == .failed ? "xmark" : "minus")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(statusColor(for: record))
                .frame(width: 26, height: 26)
                .background(statusColor(for: record).opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 6))
            VStack(alignment: .leading, spacing: 3) {
                Text(record.applicationName)
                    .font(.system(size: 13, weight: .semibold))
                Text(record.buildDate.formatted(date: .abbreviated, time: .shortened))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text(record.packagingMode.displayName)
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color(nsColor: .quaternaryLabelColor).opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 5))
        }
        .padding(.vertical, 9)
    }

    private func statusColor(for record: BuildHistoryRecord) -> Color {
        switch record.result {
        case .success: return AppTheme.success
        case .failed: return AppTheme.danger
        default: return AppTheme.warning
        }
    }

    private func statTile(_ label: String, _ value: String, _ icon: String, _ color: Color) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(color)
                .frame(width: 30, height: 30)
                .background(color.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 7))
            VStack(alignment: .leading, spacing: 5) {
                Text(label)
                    .font(.system(size: 9, weight: .bold, design: .rounded))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Text(value)
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            Spacer()
        }
        .padding(13)
        .frame(maxWidth: .infinity)
        .cardSurface()
    }
}
