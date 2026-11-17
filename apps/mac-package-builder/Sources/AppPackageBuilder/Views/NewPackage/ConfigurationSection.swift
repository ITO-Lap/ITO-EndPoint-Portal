import SwiftUI
import AppKit

struct ConfigurationSection: View {
    @ObservedObject var viewModel: NewPackageViewModel

    private let grid = [GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        SectionCard(title: "4. Configuration") {
            LazyVGrid(columns: grid, alignment: .leading, spacing: 14) {
                labeledField("Required Version") {
                    TextField("latest", text: $viewModel.configuration.requiredVersion)
                        .textFieldStyle(.roundedBorder)
                        .onSubmit { Task { await viewModel.runValidation() } }
                }
                labeledField("Architecture") {
                    Picker("", selection: $viewModel.configuration.architecture) {
                        ForEach(PackageArchitecture.allCases) { arch in
                            Text(arch.displayName).tag(arch)
                        }
                    }
                    .labelsHidden()
                    .onChange(of: viewModel.configuration.architecture) { _, _ in Task { await viewModel.runValidation() } }
                }
                labeledField("Package Identifier") {
                    TextField("com.VERMA.app", text: $viewModel.configuration.packageIdentifier)
                        .textFieldStyle(.roundedBorder)
                }
                labeledField("Package Version") {
                    TextField("1.0", text: $viewModel.configuration.packageVersion)
                        .textFieldStyle(.roundedBorder)
                }
                labeledField("Minimum macOS Version") {
                    TextField("14.0", text: $viewModel.configuration.minimumMacOSVersion)
                        .textFieldStyle(.roundedBorder)
                }
                labeledField("Output Location") {
                    HStack {
                        TextField("~/Desktop/Packages", text: $viewModel.configuration.outputDirectory)
                            .textFieldStyle(.roundedBorder)
                        Button("Choose…") { chooseOutputDirectory() }
                    }
                }
            }

            Toggle("Overwrite existing package if one already exists", isOn: $viewModel.configuration.overwriteExisting)
                .toggleStyle(.checkbox)
                .padding(.top, 4)
                .help("When off, a build fails instead of silently replacing a previous package with the same name.")
        }
    }

    private func labeledField<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            content()
        }
    }

    private func chooseOutputDirectory() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.prompt = "Choose"
        if panel.runModal() == .OK, let url = panel.url {
            viewModel.configuration.outputDirectory = url.path
        }
    }
}
