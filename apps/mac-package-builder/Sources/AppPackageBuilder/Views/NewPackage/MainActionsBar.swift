import SwiftUI

struct MainActionsBar: View {
    @ObservedObject var viewModel: NewPackageViewModel
    @State private var showOverwritePrompt = false

    var body: some View {
        HStack {
            Button("Validate") {
                Task { await viewModel.runValidation() }
            }
            .disabled(viewModel.selectedPackageInfo == nil || viewModel.isBuildRunning)

            Spacer()

            if viewModel.isBuildRunning {
                Button("Cancel Build", role: .destructive) {
                    viewModel.cancelBuild()
                }
            }

            Button {
                attemptBuild()
            } label: {
                HStack {
                    if viewModel.isBuildRunning { ProgressView().controlSize(.small) }
                    Text(viewModel.isBuildRunning ? "Building…" : "Build Package")
                }
            }
            .buttonStyle(.primaryGradient)
            .opacity(viewModel.canBuild ? 1 : 0.5)
            .disabled(!viewModel.canBuild)
            .keyboardShortcut(.defaultAction)
        }
        .alert("Output already exists", isPresented: $showOverwritePrompt) {
            Button("Cancel", role: .cancel) { }
            Button("Overwrite", role: .destructive) {
                viewModel.configuration.overwriteExisting = true
                viewModel.startBuild()
            }
        } message: {
            Text("A package with this name already exists in the output directory. Overwrite it?")
        }
    }

    private func attemptBuild() {
        if let expectedPath = PackageOutputPathing.expectedPackagePath(for: viewModel.configuration),
           !viewModel.configuration.overwriteExisting,
           FileManager.default.fileExists(atPath: expectedPath.path) {
            showOverwritePrompt = true
            return
        }
        viewModel.startBuild()
    }
}
