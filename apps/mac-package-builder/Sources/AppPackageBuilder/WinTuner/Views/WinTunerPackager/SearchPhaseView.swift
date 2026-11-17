import SwiftUI

/// The Search phase: a text field that always supports exact-ID lookup
/// against the official WinGet manifest source, and additionally supports
/// free-text name/publisher search only when the optional `winget.run`
/// discovery provider is enabled in Settings.
struct SearchPhaseView: View {
    @ObservedObject var searchViewModel: WinGetLocalSearchViewModel
    let settings: SettingsStore
    let onSelect: (WinGetManifestPackage) -> Void

    @FocusState private var isSearchFieldFocused: Bool

    var body: some View {
        SectionCard(title: "Search WinGet Packages") {
            HStack {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField("Exact WinGet ID (Publisher.Package) or name…", text: $searchViewModel.searchQuery)
                    .textFieldStyle(.plain)
                    .focused($isSearchFieldFocused)
                    .onSubmit { confirmHighlighted() }
                    .onChange(of: searchViewModel.searchQuery) { _, _ in searchViewModel.search() }
                    .onKeyPress(keys: [.upArrow, .downArrow, .return, .escape]) { press in
                        switch press.key {
                        case .upArrow:
                            searchViewModel.moveHighlight(by: -1)
                            return .handled
                        case .downArrow:
                            searchViewModel.moveHighlight(by: 1)
                            return .handled
                        case .return:
                            guard searchViewModel.highlightedIndex != nil else { return .ignored }
                            confirmHighlighted()
                            return .handled
                        case .escape:
                            searchViewModel.clearSearch()
                            return .handled
                        default:
                            return .ignored
                        }
                    }
                    .accessibilityLabel("Search WinGet packages")
                if searchViewModel.searchPhase == .loading {
                    ProgressView().controlSize(.small)
                } else if !searchViewModel.searchQuery.isEmpty {
                    Button {
                        searchViewModel.clearSearch()
                        isSearchFieldFocused = true
                    } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Clear search")
                }
            }
            .padding(10)
            .background(.background)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(.separator))
            .onAppear { isSearchFieldFocused = true }

            if !settings.enableWinGetRunDiscovery && !searchViewModel.looksLikeExactId && !searchViewModel.searchQuery.isEmpty {
                Text("Enable WinGet.run discovery in Settings for name search, or enter the exact WinGet ID (Publisher.Package).")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 4)
            }

            phaseBody
        }
    }

    @ViewBuilder
    private var phaseBody: some View {
        switch searchViewModel.searchPhase {
        case .idle:
            EmptyView()
        case .loading:
            EmptyView()
        case .empty:
            VStack(alignment: .leading, spacing: 4) {
                Text("No results for \"\(searchViewModel.searchQuery)\".")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if !settings.enableWinGetRunDiscovery && !searchViewModel.looksLikeExactId {
                    Text("Enable WinGet.run discovery in Settings for name search, or enter the exact WinGet ID (Publisher.Package).")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 4)
        case .offline:
            statusBanner(icon: "wifi.slash", color: .orange, message: "Could not reach the WinGet manifest source. Check your internet connection.")
        case .rateLimited:
            statusBanner(icon: "clock.badge.exclamationmark", color: .orange, message: "The manifest source is rate-limiting unauthenticated requests right now. Try again shortly.")
        case .error(let message):
            statusBanner(icon: "exclamationmark.triangle.fill", color: .red, message: message)
        case .results:
            resultsList
        }
    }

    private func statusBanner(icon: String, color: Color, message: String) -> some View {
        HStack(alignment: .top, spacing: 6) {
            Image(systemName: icon).foregroundStyle(color)
            Text(message).font(.caption)
            Spacer()
            Button("Retry") { searchViewModel.search() }
                .buttonStyle(.plain)
                .font(.caption.bold())
                .foregroundStyle(.blue)
        }
        .padding(8)
        .background(color.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var resultsList: some View {
        VStack(spacing: 0) {
            ForEach(Array(searchViewModel.results.enumerated()), id: \.element.id) { index, result in
                Button { onSelect(result) } label: {
                    HStack {
                        Image(systemName: "app.dashed")
                            .font(.title3)
                            .foregroundStyle(.white)
                            .frame(width: 32, height: 32)
                            .background(Color(red: 0.0, green: 0.64, blue: 0.56))
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                        VStack(alignment: .leading, spacing: 1) {
                            Text(result.name).font(.body)
                            Text("\(result.publisher) · \(result.id)").font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text("v\(result.latestVersion)").font(.caption).bold()
                            Text(result.source).font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                    .padding(8)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .background(
                    searchViewModel.highlightedIndex == index
                        ? Color(red: 0.0, green: 0.64, blue: 0.56).opacity(0.15)
                        : Color.clear
                )
                .onHover { isHovering in
                    if isHovering { searchViewModel.highlightedIndex = index }
                }
                Divider()
            }
        }
        .background(.background)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func confirmHighlighted() {
        guard let result = searchViewModel.highlightedResult() else { return }
        onSelect(result)
    }
}
