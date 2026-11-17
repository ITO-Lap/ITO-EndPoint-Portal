import Foundation

public protocol CodeSignatureInspecting: Sendable {
    func inspect(at applicationURL: URL) -> CodeSignatureInspection
}

public struct ApplicationScanner: Sendable {
    private let roots: [InventoryScanRoot]
    private let signatureInspector: any CodeSignatureInspecting

    public init(
        roots: [InventoryScanRoot] = InventoryScanRoot.standard(),
        signatureInspector: any CodeSignatureInspecting = MacCodeSignatureInspector()
    ) {
        self.roots = roots
        self.signatureInspector = signatureInspector
    }

    public func scan() -> InventoryScanResult {
        var applications: [InstalledApplication] = []
        var issues: [InventoryScanIssue] = []
        var seenPaths = Set<String>()

        for root in roots {
            var isDirectory: ObjCBool = false
            guard FileManager.default.fileExists(atPath: root.url.path, isDirectory: &isDirectory), isDirectory.boolValue else {
                issues.append(InventoryScanIssue(path: root.url.path, message: "Scan root is unavailable or is not a directory."))
                continue
            }

            guard let enumerator = FileManager.default.enumerator(
                at: root.url,
                includingPropertiesForKeys: [.isDirectoryKey, .isPackageKey, .contentModificationDateKey],
                options: [.skipsHiddenFiles, .skipsPackageDescendants],
                errorHandler: { url, error in
                    issues.append(InventoryScanIssue(path: url.path, message: error.localizedDescription))
                    return true
                }
            ) else {
                issues.append(InventoryScanIssue(path: root.url.path, message: "Unable to enumerate scan root."))
                continue
            }

            for case let applicationURL as URL in enumerator {
                guard applicationURL.pathExtension.caseInsensitiveCompare("app") == .orderedSame else { continue }
                enumerator.skipDescendants()

                let standardizedPath = applicationURL.standardizedFileURL.path
                guard seenPaths.insert(standardizedPath).inserted else { continue }

                do {
                    applications.append(try inspectApplication(at: applicationURL, source: root.source))
                } catch {
                    issues.append(InventoryScanIssue(path: applicationURL.path, message: error.localizedDescription))
                }
            }
        }

        applications.sort {
            let nameOrder = $0.name.localizedCaseInsensitiveCompare($1.name)
            return nameOrder == .orderedSame ? $0.installPath < $1.installPath : nameOrder == .orderedAscending
        }
        return InventoryScanResult(applications: applications, issues: issues)
    }

    private func inspectApplication(at url: URL, source: AppInstallSource) throws -> InstalledApplication {
        guard let bundle = Bundle(url: url), let bundleIdentifier = bundle.bundleIdentifier else {
            throw ApplicationScannerError.missingBundleIdentifier
        }

        let values = try? url.resourceValues(forKeys: [.contentModificationDateKey])
        return InstalledApplication(
            name: (bundle.infoDictionary?["CFBundleDisplayName"] as? String)
                ?? (bundle.infoDictionary?["CFBundleName"] as? String)
                ?? url.deletingPathExtension().lastPathComponent,
            bundleIdentifier: bundleIdentifier,
            shortVersion: bundle.infoDictionary?["CFBundleShortVersionString"] as? String,
            bundleVersion: bundle.infoDictionary?["CFBundleVersion"] as? String,
            installPath: url.standardizedFileURL.path,
            installSource: source,
            codeSignature: signatureInspector.inspect(at: url),
            lastModifiedAt: values?.contentModificationDate
        )
    }
}

public enum ApplicationScannerError: LocalizedError {
    case missingBundleIdentifier

    public var errorDescription: String? {
        switch self {
        case .missingBundleIdentifier:
            return "Application bundle has no CFBundleIdentifier."
        }
    }
}