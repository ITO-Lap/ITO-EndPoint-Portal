import SwiftUI

struct PackageTypeSection: View {
    @ObservedObject var viewModel: NewPackageViewModel

    var body: some View {
        SectionCard(title: "2. Package Type") {
            Picker("Package Type", selection: $viewModel.configuration.packageKind) {
                ForEach(PackageKind.allCases) { kind in
                    Text(kind.displayName).tag(kind)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .onChange(of: viewModel.configuration.packageKind) { _, _ in
                Task { await viewModel.runValidation() }
            }
            .accessibilityLabel("Package type: cask or formula")

            Text(viewModel.configuration.packageKind == .cask
                 ? "Casks are pre-built applications distributed by Homebrew."
                 : "Formulas are built or bottled command-line tools and services.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}
