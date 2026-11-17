import SwiftUI

struct SelectApplicationSection: View {
    @ObservedObject var viewModel: NewPackageViewModel
    @FocusState private var isSearchFieldFocused: Bool

    var body: some View {
        SectionCard(title: "1. Select Application") {
            HStack {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField("Search Homebrew casks and formulas…", text: $viewModel.searchQuery)
                    .textFieldStyle(.plain)
                    .focused($isSearchFieldFocused)
                    .onSubmit { viewModel.selectHighlightedResult() }
                    .onChange(of: viewModel.searchQuery) { _, _ in viewModel.search() }
                    .onKeyPress(keys: [.upArrow, .downArrow, .return, .escape]) { press in
                        switch press.key {
                        case .upArrow:
                            viewModel.moveHighlight(by: -1)
                            return .handled
                        case .downArrow:
                            viewModel.moveHighlight(by: 1)
                            return .handled
                        case .return:
                            guard viewModel.highlightedResultIndex != nil else { return .ignored }
                            viewModel.selectHighlightedResult()
                            return .handled
                        case .escape:
                            viewModel.dismissResults()
                            return .handled
                        default:
                            return .ignored
                        }
                    }
                    .accessibilityLabel("Search for a Homebrew application")
                if viewModel.isSearching {
                    ProgressView().controlSize(.small)
                } else if !viewModel.searchQuery.isEmpty {
                    Button {
                        viewModel.clearSearch()
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

            switch viewModel.searchPhase {
            case .empty:
                Text("No casks or formulas match \"\(viewModel.searchQuery)\".")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 4)
            case .error(let message):
                HStack(alignment: .top, spacing: 6) {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                    Text(message).font(.caption)
                    Spacer()
                    Button("Retry") { viewModel.search() }
                        .buttonStyle(.plain)
                        .font(.caption.bold())
                        .foregroundStyle(.blue)
                }
                .padding(8)
                .background(Color.orange.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            default:
                EmptyView()
            }

            if !viewModel.searchResults.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(viewModel.searchResults.prefix(8).enumerated()), id: \.element.id) { index, result in
                        Button { viewModel.select(result) } label: {
                            HStack {
                                appIcon(for: result.kind)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(result.name).font(.body)
                                    Text(result.token).font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text(result.kind.displayName)
                                    .font(.caption2).bold()
                                    .padding(.horizontal, 6).padding(.vertical, 2)
                                    .background(Color.blue.opacity(0.15))
                                    .foregroundStyle(.blue)
                                    .clipShape(Capsule())
                            }
                            .padding(8)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .background(
                            viewModel.highlightedResultIndex == index
                                ? Color.blue.opacity(0.15)
                                : Color.clear
                        )
                        .onHover { isHovering in
                            if isHovering { viewModel.highlightedResultIndex = index }
                        }
                        Divider()
                    }
                }
                .background(.background)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }

            if let info = viewModel.selectedPackageInfo {
                HStack(spacing: 12) {
                    appIcon(for: info.kind)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(info.name).font(.headline)
                        Text(info.token).font(.caption).foregroundStyle(.secondary)
                        if let desc = info.description {
                            Text(desc).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                        }
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(info.kind.displayName).font(.caption).bold()
                        Text("v\(info.version)").font(.caption2).foregroundStyle(.secondary)
                    }
                }
                .padding(10)
                .background(Color.blue.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
    }

    @ViewBuilder
    private func appIcon(for kind: PackageKind) -> some View {
        Image(systemName: kind == .cask ? "app.badge" : "terminal.fill")
            .font(.title3)
            .foregroundStyle(.white)
            .frame(width: 32, height: 32)
            .background(kind == .cask ? Color.blue : Color.gray)
            .clipShape(RoundedRectangle(cornerRadius: 6))
    }
}
