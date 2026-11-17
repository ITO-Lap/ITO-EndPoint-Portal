import Foundation
import OSLog

/// Facts extracted from an already-built `.pkg` by expanding it with the
/// system `pkgutil`/`lsbom` tools — never by re-implementing xar/bom parsing,
/// and never by trusting values the build configuration merely *intended*.
/// A build claims to have produced a certain identifier/version; this is what
/// the artifact on disk actually contains.
struct PackageInspectionReport: Codable, Equatable {
    let identifier: String?
    let version: String?
    let installLocation: String?
    let payloadFileCount: Int
    let samplePayloadPaths: [String]
    let scriptNames: [String]
    let signatureStatus: String
    let sizeBytes: Int64
}

enum PackageInspectorError: LocalizedError {
    case notFound(URL)
    case expandFailed(String)

    var errorDescription: String? {
        switch self {
        case .notFound(let url):
            return "\(url.lastPathComponent) does not exist and cannot be inspected."
        case .expandFailed(let reason):
            return "pkgutil --expand failed: \(reason)"
        }
    }
}

protocol PackageInspectorServicing {
    func inspect(packageAt path: URL) async throws -> PackageInspectionReport
}

final class PackageInspectorService: PackageInspectorServicing {
    private let processRunner: ProcessRunning
    private let fileManager: FileManager
    private let log = Logger(subsystem: "com.AKVERMA.AppPackageBuilder", category: "PackageInspector")

    init(processRunner: ProcessRunning = ProcessRunner(), fileManager: FileManager = .default) {
        self.processRunner = processRunner
        self.fileManager = fileManager
    }

    func inspect(packageAt path: URL) async throws -> PackageInspectionReport {
        guard fileManager.fileExists(atPath: path.path) else {
            throw PackageInspectorError.notFound(path)
        }
        log.info("Inspecting package at \(path.path, privacy: .public)")

        let sizeBytes = (try? fileManager.attributesOfItem(atPath: path.path)[.size] as? Int64) ?? 0

        let tempRoot = fileManager.temporaryDirectory
        let expandDir = tempRoot.appendingPathComponent("PkgInspect-\(UUID().uuidString)", isDirectory: true)
        defer { try? PathValidator.removeContentsSafely(expandDir, mustBeWithin: tempRoot) }

        let expand = try await processRunner.run(
            "/usr/sbin/pkgutil",
            arguments: ["--expand", path.path, expandDir.path],
            currentDirectory: nil,
            environment: nil,
            onOutputLine: nil
        )
        guard expand.exitCode == 0 else {
            throw PackageInspectorError.expandFailed(expand.stderr.isEmpty ? "unknown pkgutil error" : expand.stderr)
        }

        let (identifier, version, installLocation) = parsePackageInfo(at: expandDir)
        let scriptNames = scriptFileNames(at: expandDir)
        let payloadPaths = try await payloadPaths(expandDir: expandDir)

        let signature = try await processRunner.run(
            "/usr/sbin/pkgutil",
            arguments: ["--check-signature", path.path],
            currentDirectory: nil,
            environment: nil,
            onOutputLine: nil
        )
        let signatureStatus = !signature.stdout.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? signature.stdout.trimmingCharacters(in: .whitespacesAndNewlines)
            : "Package is not signed."

        return PackageInspectionReport(
            identifier: identifier,
            version: version,
            installLocation: installLocation,
            payloadFileCount: payloadPaths.count,
            samplePayloadPaths: Array(payloadPaths.prefix(25)),
            scriptNames: scriptNames,
            signatureStatus: signatureStatus,
            sizeBytes: sizeBytes
        )
    }

    /// `pkgutil --expand` writes a flat `PackageInfo` XML file with the real
    /// identifier/version/install-location as attributes on `<pkg-info>` —
    /// parsed here with a narrow attribute scan rather than a full XML parser
    /// since we only ever need these three known attributes.
    private func parsePackageInfo(at expandDir: URL) -> (identifier: String?, version: String?, installLocation: String?) {
        let infoPath = expandDir.appendingPathComponent("PackageInfo")
        guard let data = try? Data(contentsOf: infoPath), let xml = String(data: data, encoding: .utf8) else {
            return (nil, nil, nil)
        }
        return (
            attributeValue(in: xml, tag: "pkg-info", attribute: "identifier"),
            attributeValue(in: xml, tag: "pkg-info", attribute: "version"),
            attributeValue(in: xml, tag: "pkg-info", attribute: "install-location")
        )
    }

    private func attributeValue(in xml: String, tag: String, attribute: String) -> String? {
        let pattern = "<\(tag)\\b[^>]*\\b\(attribute)=\"([^\"]*)\""
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
        let matches = regex.matches(in: xml, range: NSRange(xml.startIndex..., in: xml))
        for match in matches {
            guard let valueRange = Range(match.range(at: 1), in: xml) else { continue }
            return String(xml[valueRange])
        }
        return nil
    }

    private func scriptFileNames(at expandDir: URL) -> [String] {
        let scriptsDir = expandDir.appendingPathComponent("Scripts")
        guard let items = try? fileManager.contentsOfDirectory(atPath: scriptsDir.path) else { return [] }
        return items.sorted()
    }

    private func payloadPaths(expandDir: URL) async throws -> [String] {
        let bomPath = expandDir.appendingPathComponent("Bom")
        guard fileManager.fileExists(atPath: bomPath.path) else { return [] }
        let output = try await processRunner.run(
            "/usr/bin/lsbom",
            arguments: ["-s", bomPath.path],
            currentDirectory: nil,
            environment: nil,
            onOutputLine: nil
        )
        guard output.exitCode == 0 else { return [] }
        return output.stdout
            .split(separator: "\n")
            .map(String.init)
            .filter { !$0.isEmpty }
    }
}
