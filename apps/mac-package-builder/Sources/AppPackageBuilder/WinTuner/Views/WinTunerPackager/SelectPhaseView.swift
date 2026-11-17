import SwiftUI

/// The Select phase: choose a version of the previously selected WinGet
/// package. Selecting a version resolves the real installer manifest before
/// advancing — no phase transition happens until that succeeds.
struct SelectPhaseView: View {
    @ObservedObject var viewModel: WinTunerConfigurationViewModel

    var body: some View {
        SectionCard(title: "Select Version") {
            if let package = viewModel.selectedPackage {
                HStack(spacing: 12) {
                    Image(systemName: "app.dashed")
                        .font(.title3)
                        .foregroundStyle(.white)
                        .frame(width: 32, height: 32)
                        .background(Color(red: 0.0, green: 0.64, blue: 0.56))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(package.name).font(.headline)
                        Text("\(package.publisher) · \(package.id)").font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                }
                .padding(.bottom, 8)
            }

            if viewModel.isLoadingVersions {
                ProgressView("Loading versions…")
            } else if let error = viewModel.loadVersionsError {
                statusBanner(message: error) { Task { await viewModel.loadVersions() } }
            } else if viewModel.availableVersions.isEmpty {
                Text("No versions found for this package.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                List(viewModel.availableVersions.reversed(), id: \.self) { version in
                    Button {
                        Task { await viewModel.resolveManifest(version: version) }
                    } label: {
                        HStack {
                            Text(version)
                            if version == viewModel.selectedPackage?.latestVersion {
                                Text("Latest").font(.caption2).bold()
                                    .padding(.horizontal, 6).padding(.vertical, 2)
                                    .background(Color.green.opacity(0.15))
                                    .foregroundStyle(.green)
                                    .clipShape(Capsule())
                            }
                            Spacer()
                            if viewModel.selectedVersion == version && viewModel.isResolvingManifest {
                                ProgressView().controlSize(.small)
                            }
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(viewModel.isResolvingManifest)
                }
                .frame(minHeight: 160, maxHeight: 280)
            }

            if let error = viewModel.resolveManifestError {
                statusBanner(message: error) {
                    if let version = viewModel.selectedVersion {
                        Task { await viewModel.resolveManifest(version: version) }
                    }
                }
            }

            Button("Back to Search") { viewModel.phase = .search }
                .buttonStyle(.plain)
                .font(.caption)
                .padding(.top, 4)
        }
    }

    private func statusBanner(message: String, retry: @escaping () -> Void) -> some View {
        HStack(alignment: .top, spacing: 6) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.red)
            Text(message).font(.caption)
            Spacer()
            Button("Retry", action: retry)
                .buttonStyle(.plain)
                .font(.caption.bold())
                .foregroundStyle(.blue)
        }
        .padding(8)
        .background(Color.red.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}
