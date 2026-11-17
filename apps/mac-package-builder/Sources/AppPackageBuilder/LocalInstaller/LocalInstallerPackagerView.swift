import SwiftUI
import AppKit

/// "Local Installer": browse an .msi/.exe/.msix/.appx (or a source folder) and build an .intunewin on this Mac.
struct LocalInstallerPackagerView: View {
    @StateObject private var vm = LocalInstallerViewModel()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                ScreenHeader(
                    title: "Local Installer Packager",
                    subtitle: "Browse an .msi, .exe, .msix or .appx (or a source folder) and build the .intunewin on this Mac — no Windows host or WinTuner needed."
                ) { EmptyView() }

                chooseCard
                if vm.sourceURL != nil, vm.phase != .failed(vm.failureText) || vm.guess != nil { detailsCard }
                if case .failed(let message) = vm.phase { banner(message, color: .red, icon: "exclamationmark.triangle.fill") }
                if vm.phase == .packaging || !vm.log.isEmpty { logCard }
                if let o = vm.outcome { resultCard(o) }
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
    }

    // MARK: Cards

    private var chooseCard: some View {
        SectionCard(title: "1. Choose the installer") {
            HStack(spacing: 10) {
                Button { vm.browseFile() } label: { Label("Browse installer…", systemImage: "doc.badge.plus") }
                    .buttonStyle(PrimaryGradientButtonStyle())
                    .accessibilityLabel("Browse for an installer file")
                Button { vm.browseFolder() } label: { Label("Browse folder…", systemImage: "folder") }
                    .accessibilityLabel("Browse for a source folder")
                Spacer()
            }
            if let url = vm.sourceURL {
                Text(url.path).font(.caption).foregroundStyle(.secondary).textSelection(.enabled).lineLimit(2)
            } else {
                Text("Supported: .msi, .exe, .msix, .appx. A single file is packaged on its own; a folder is packaged whole, with the setup file you pick.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            if vm.isFolder, !vm.folderInstallers.isEmpty {
                Picker("Setup file", selection: Binding(get: { vm.setupFile }, set: { vm.chooseSetup($0) })) {
                    ForEach(vm.folderInstallers, id: \.self) { Text($0).tag($0) }
                }
            }
        }
    }

    private var detailsCard: some View {
        SectionCard(title: "2. Review details") {
            if let g = vm.guess {
                HStack(spacing: 8) {
                    StatusBadge(status: g.confidence == .verified ? .pass : .warning, text: g.confidence.label)
                    StatusBadge(status: .warning, text: "Windows validation required")
                }
                Text(g.note).font(.caption).foregroundStyle(.secondary)
            }
            field("App name", text: $vm.appName)
            field("Version", text: $vm.version)
            Picker("Architecture", selection: $vm.architecture) { ForEach(LocalArchitecture.allCases) { Text($0.rawValue).tag($0) } }
                .pickerStyle(.segmented).frame(maxWidth: 260)
            field("Install command", text: $vm.installCommand, mono: true)
            field("Uninstall command", text: $vm.uninstallCommand, mono: true)
            if vm.guess?.kind == .msi {
                field("MSI ProductCode (optional)", text: $vm.productCode, mono: true, onChange: vm.productCodeChanged)
            }
            HStack {
                field("Output folder", text: $vm.outputBase)
                Button("Choose…") { vm.browseOutput() }
            }
            Text("Built natively on macOS in the standard .intunewin format. Microsoft's own Content Prep Tool (IntuneWinAppUtil.exe) is Windows-only; use the Windows worker if you need that exact tool.")
                .font(.caption2).foregroundStyle(.secondary)
            Button { Task { await vm.package() } } label: {
                if vm.phase == .packaging { ProgressView().controlSize(.small) } else { Label("Create .intunewin", systemImage: "shippingbox.fill") }
            }
            .buttonStyle(PrimaryGradientButtonStyle())
            .disabled(!vm.canPackage)
        }
    }

    private var logCard: some View {
        SectionCard(title: "Progress") {
            ForEach(Array(vm.log.enumerated()), id: \.offset) { _, line in Text(line).font(.system(.caption, design: .monospaced)).textSelection(.enabled) }
            if vm.phase == .packaging { ProgressView("Packaging…").controlSize(.small) }
        }
    }

    private func resultCard(_ o: LocalInstallerOutcome) -> some View {
        SectionCard(title: "3. Result") {
            StatusBadge(status: .pass, text: "Package created and self-verified")
            StatusBadge(status: .warning, text: "Not tested on Windows")
            Text(o.result.outputURL.path).font(.caption).textSelection(.enabled)
            Text("SHA-256 \(o.result.sha256)").font(.system(.caption2, design: .monospaced)).textSelection(.enabled)
            Text("Also written: \(([o.commandsFile, o.infoFile] + (o.detectionFile.map { [$0] } ?? [])).map(\.lastPathComponent).joined(separator: ", "))").font(.caption).foregroundStyle(.secondary)
            HStack {
                Button("Reveal in Finder") { NSWorkspace.shared.activateFileViewerSelecting([o.result.outputURL]) }
                Button("Copy path") { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(o.result.outputURL.path, forType: .string) }
            }
        }
    }

    // MARK: Pieces

    private func field(_ label: String, text: Binding<String>, mono: Bool = false, onChange: (() -> Void)? = nil) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label).font(.caption.bold()).foregroundStyle(.secondary)
            TextField(label, text: text).textFieldStyle(.roundedBorder).font(mono ? .system(.body, design: .monospaced) : .body)
                .onChange(of: text.wrappedValue) { _, _ in onChange?() }
        }
    }

    private func banner(_ message: String, color: Color, icon: String) -> some View {
        HStack(alignment: .top, spacing: 6) {
            Image(systemName: icon).foregroundStyle(color)
            Text(message).font(.caption).textSelection(.enabled)
            Spacer()
        }
        .padding(8).background(color.opacity(0.1)).clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

private extension LocalInstallerViewModel {
    var failureText: String { if case .failed(let m) = phase { return m } else { return "" } }
}
