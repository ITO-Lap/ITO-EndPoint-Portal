import SwiftUI

/// Step 1: pick a `WinGetPackage` to package. Embeds a lightweight search
/// list — conceptually the same search UX as `WinGetCatalogView` — scoped to
/// just selection rather than the full detail-pane browsing experience.
struct SelectApplicationStep: View {
    @ObservedObject var viewModel: WindowsPackageWizardViewModel
    @State private var query = ""
    @State private var results: [WinGetPackage] = []
    @State private var phase: RemoteJobPhase = .idle
    @State private var searchTask: Task<Void, Never>?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Search the WinGet catalog for the application to package.")
                .font(.callout).foregroundStyle(.secondary)
            TextField("Search by name or publisher…", text: $query)
                .textFieldStyle(.roundedBorder)
                .onChange(of: query) { _, newValue in search(newValue) }

            RemoteJobPhaseView(phase: phase, emptyText: "No matching WinGet packages.")

            if let selected = viewModel.selectedPackage {
                SectionCard(title: "Selected") {
                    HStack {
                        VStack(alignment: .leading) {
                            Text(selected.name).bold()
                            Text("\(selected.publisher) · \(selected.latestVersion)")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        if case .loading = viewModel.detailPhase {
                            ProgressView().controlSize(.small)
                        }
                    }
                }
            }

            ForEach(results) { package in
                Button {
                    viewModel.selectPackage(package)
                } label: {
                    HStack {
                        VStack(alignment: .leading) {
                            Text(package.name).bold()
                            Text("\(package.publisher) · \(package.latestVersion)")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        if viewModel.selectedPackage?.id == package.id {
                            Image(systemName: "checkmark.circle.fill").foregroundStyle(.blue)
                        }
                    }
                    .padding(8)
                    .background(.background.secondary)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func search(_ text: String) {
        searchTask?.cancel()
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            phase = .idle
            results = []
            return
        }
        phase = .loading
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            do {
                let found = try await viewModel.client.searchPackages(query: trimmed, source: nil)
                guard !Task.isCancelled else { return }
                results = found
                phase = found.isEmpty ? .empty : .idle
            } catch {
                guard !Task.isCancelled else { return }
                phase = .disconnected
            }
        }
    }
}
