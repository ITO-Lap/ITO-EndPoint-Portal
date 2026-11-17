import Foundation
import AppKit

@MainActor
final class LocalInstallerViewModel: ObservableObject {
    enum Phase: Equatable { case idle, packaging, done, failed(String) }

    @Published var sourceURL: URL?
    @Published var isFolder = false
    @Published var folderInstallers: [String] = []
    @Published var setupFile = ""
    @Published var appName = ""
    @Published var version = ""
    @Published var architecture: LocalArchitecture = .x64
    @Published var installCommand = ""
    @Published var uninstallCommand = ""
    @Published var productCode = ""
    @Published var publisher = ""
    @Published var outputBase = "~/Desktop/Packages/Windows"
    @Published private(set) var guess: LocalInstallerGuess?
    @Published private(set) var phase: Phase = .idle
    @Published private(set) var log: [String] = []
    @Published private(set) var outcome: LocalInstallerOutcome?

    private let service: LocalInstallerPackagerService
    init(service: LocalInstallerPackagerService = LocalInstallerPackagerService()) { self.service = service }

    var canPackage: Bool { sourceURL != nil && !setupFile.isEmpty && phase != .packaging }

    // MARK: Browsing

    func browseFile() {
        let panel = NSOpenPanel()
        panel.title = "Choose an installer"
        panel.message = "Choose an .msi, .exe, .msix or .appx file to package."
        panel.allowedContentTypes = LocalInstallerKind.allCases.compactMap { .init(filenameExtension: $0.rawValue) }
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        if panel.runModal() == .OK, let url = panel.url { select(file: url) }
    }

    func browseFolder() {
        let panel = NSOpenPanel()
        panel.title = "Choose an installer source folder"
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        if panel.runModal() == .OK, let url = panel.url { select(folder: url) }
    }

    func browseOutput() {
        let panel = NSOpenPanel()
        panel.title = "Choose the output folder"
        panel.canChooseFiles = false; panel.canChooseDirectories = true; panel.canCreateDirectories = true
        if panel.runModal() == .OK, let url = panel.url { outputBase = url.path }
    }

    func select(file url: URL) {
        reset()
        guard LocalInstallerKind.kind(for: url) != nil else { phase = .failed("\(url.lastPathComponent) is not an .msi, .exe, .msix or .appx installer."); return }
        sourceURL = url; isFolder = false; setupFile = url.lastPathComponent
        apply(LocalInstallerInspector.inspect(url))
    }

    func select(folder url: URL) {
        reset()
        let fm = FileManager.default
        var found: [String] = []
        if let e = fm.enumerator(at: url, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]) {
            for case let f as URL in e where LocalInstallerKind.kind(for: f) != nil {
                found.append(String(f.path.dropFirst(url.path.count + 1)))
            }
        }
        found.sort()
        sourceURL = url; isFolder = true; folderInstallers = found
        if found.isEmpty { phase = .failed("No .msi, .exe, .msix or .appx installer was found in that folder."); return }
        chooseSetup(found[0])
    }

    func chooseSetup(_ rel: String) {
        guard let url = sourceURL else { return }
        setupFile = rel
        apply(LocalInstallerInspector.inspect(url.appendingPathComponent(rel)))
    }

    private func apply(_ g: LocalInstallerGuess?) {
        guess = g
        guard let g else { return }
        appName = g.appName; version = g.version; architecture = g.architecture
        installCommand = g.installCommand; uninstallCommand = g.uninstallCommand
        productCode = g.productCode; publisher = g.publisher
    }

    /// With a ProductCode (MSI), derive the standard uninstall command instead of leaving it blank.
    func productCodeChanged() {
        guard guess?.kind == .msi, !productCode.isEmpty, uninstallCommand.isEmpty || uninstallCommand.hasPrefix("msiexec /x") else { return }
        uninstallCommand = "msiexec /x \"\(productCode)\" /qn /norestart"
    }

    private func reset() {
        sourceURL = nil; folderInstallers = []; setupFile = ""; guess = nil; outcome = nil; log = []; phase = .idle
        appName = ""; version = ""; installCommand = ""; uninstallCommand = ""; productCode = ""; publisher = ""
    }

    // MARK: Package

    func package() async {
        guard let source = sourceURL else { return }
        phase = .packaging; outcome = nil; log = []
        let request = LocalInstallerRequest(source: source, isFolder: isFolder, setupFile: setupFile, appName: appName, version: version,
            architecture: architecture, installCommand: installCommand, uninstallCommand: uninstallCommand, productCode: productCode, publisher: publisher, outputBase: outputBase)
        do {
            let result = try await service.package(request) { [weak self] line in Task { @MainActor in self?.log.append(line) } }
            outcome = result; phase = .done
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }
}
