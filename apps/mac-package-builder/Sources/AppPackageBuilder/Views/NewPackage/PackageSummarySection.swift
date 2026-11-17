import SwiftUI

struct PackageSummarySection: View {
    @ObservedObject var viewModel: NewPackageViewModel

    var body: some View {
        SectionCard(title: "Package Summary") {
            HStack {
                Spacer()
                StatusBadge(status: viewModel.validation.overallStatus, text: readyLabel)
            }
            if let info = viewModel.selectedPackageInfo {
                VStack(alignment: .leading, spacing: 2) {
                    Text(info.name).font(.headline)
                    Text(info.token).font(.caption).foregroundStyle(.secondary)
                    if let desc = info.description {
                        Text(desc).font(.caption2).foregroundStyle(.secondary)
                    }
                }
                Divider()
                summaryRow("Formula/Cask", info.kind.displayName)
                summaryRow("Required Version", viewModel.configuration.requiredVersion)
                summaryRow("Architecture", viewModel.configuration.architecture.displayName)
                summaryRow("Package Identifier", viewModel.configuration.packageIdentifier)
                summaryRow("Packaging Mode", viewModel.configuration.packagingMode.displayName)
                summaryRow("Output Path", (viewModel.configuration.outputDirectory as NSString).abbreviatingWithTildeInPath)
                summaryRow("Signing", viewModel.configuration.signPackage ? "Enabled" : "Unsigned")
                summaryRow("Validation", viewModel.validation.canBuild ? "Passed" : "Blocked")
            } else {
                Text("Select an application to see a build summary.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var readyLabel: String {
        switch viewModel.validation.overallStatus {
        case .pass: return "Ready to Build"
        case .warning: return "Ready with Warnings"
        case .fail: return "Blocked"
        case .checking: return "Checking…"
        }
    }

    private func summaryRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Spacer()
            Text(value).font(.caption).bold().lineLimit(1).truncationMode(.middle)
        }
    }
}
