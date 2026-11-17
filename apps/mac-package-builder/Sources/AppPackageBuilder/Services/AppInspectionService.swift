import Foundation
import OSLog

protocol AppInspectionServicing {
    func inspectSignature(appPath: URL) async throws -> AppSignatureInfo
    func detectSystemExtensions(appPath: URL) async -> [DetectedSystemExtension]
    func detectBackgroundItems(appPath: URL) async -> [DetectedBackgroundItem]
}

enum AppInspectionError: LocalizedError {
    case notAnAppBundle(URL)

    var errorDescription: String? {
        switch self {
        case .notAnAppBundle(let url):
            return "\(url.lastPathComponent) is not a valid .app bundle (missing Contents/Info.plist)."
        }
    }
}

/// Extracts real facts (bundle ID, Team ID, designated code requirement,
/// extensions, background items) from an on-disk `.app` via `codesign` and
/// `PlistBuddy` — the same tools Apple's own documentation uses to describe
/// these values. Every optional field that couldn't be read stays `nil`;
/// nothing here fabricates an identifier a signature didn't actually contain.
final class AppInspectionService: AppInspectionServicing {
    private let processRunner: ProcessRunning
    private let fileManager: FileManager
    private let log = Logger(subsystem: "com.AKVERMA.AppPackageBuilder", category: "AppInspection")

    init(processRunner: ProcessRunning = ProcessRunner(), fileManager: FileManager = .default) {
        self.processRunner = processRunner
        self.fileManager = fileManager
    }

    func inspectSignature(appPath: URL) async throws -> AppSignatureInfo {
        let infoPlistPath = appPath.appendingPathComponent("Contents/Info.plist")
        guard fileManager.fileExists(atPath: infoPlistPath.path) else {
            throw AppInspectionError.notAnAppBundle(appPath)
        }

        let bundleIdentifier = try? await plistBuddyRead(plist: infoPlistPath, key: "CFBundleIdentifier")
        let executableName = try? await plistBuddyRead(plist: infoPlistPath, key: "CFBundleExecutable")
        let displayName = (try? await plistBuddyRead(plist: infoPlistPath, key: "CFBundleName")) ?? appPath.deletingPathExtension().lastPathComponent

        let signatureOutput = try? await processRunner.run(
            "/usr/bin/codesign",
            arguments: ["-dv", "--verbose=2", appPath.path],
            currentDirectory: nil,
            environment: nil,
            onOutputLine: nil
        )
        let signatureText = signatureOutput?.stderr ?? ""
        let isSigned = (signatureOutput?.exitCode ?? 1) == 0
        let teamIdentifier = firstMatch(in: signatureText, prefix: "TeamIdentifier=").flatMap { $0 == "not set" ? nil : $0 }
        let notarizationLine = firstMatch(in: signatureText, prefix: "Notarization Ticket=")
        let isNotarized = notarizationLine == "stapled"

        var codeRequirement: String?
        if isSigned {
            let requirementOutput = try? await processRunner.run(
                "/usr/bin/codesign",
                arguments: ["-d", "-r-", appPath.path],
                currentDirectory: nil,
                environment: nil,
                onOutputLine: nil
            )
            if let text = requirementOutput?.stdout, let range = text.range(of: "designated => ") {
                codeRequirement = String(text[range.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }

        let executablePath = executableName.map { appPath.appendingPathComponent("Contents/MacOS/\($0)").path }

        log.info("Inspected \(appPath.lastPathComponent, privacy: .public): signed=\(isSigned), team=\(teamIdentifier ?? "none", privacy: .public)")

        return AppSignatureInfo(
            appPath: appPath.path,
            appName: displayName,
            bundleIdentifier: bundleIdentifier,
            teamIdentifier: teamIdentifier,
            codeRequirement: codeRequirement,
            executablePath: executablePath,
            isSigned: isSigned,
            isNotarized: isNotarized
        )
    }

    func detectSystemExtensions(appPath: URL) async -> [DetectedSystemExtension] {
        var results: [DetectedSystemExtension] = []
        let candidateDirs = [
            appPath.appendingPathComponent("Contents/Library/SystemExtensions"),
            appPath.appendingPathComponent("Contents/Library/LoginItems")
        ]

        for dir in candidateDirs {
            let bundles = extensionBundleCandidates(in: dir)
            for bundle in bundles {
                if let detected = await inspectExtensionBundle(bundle) {
                    results.append(detected)
                }
            }
        }

        return results
    }

    func detectBackgroundItems(appPath: URL) async -> [DetectedBackgroundItem] {
        var results: [DetectedBackgroundItem] = []

        let launchAgentsDir = appPath.appendingPathComponent("Contents/Library/LaunchAgents")
        results += plistFiles(in: launchAgentsDir).map {
            DetectedBackgroundItem(kind: .launchAgent, identifier: launchdLabel(of: $0) ?? $0.deletingPathExtension().lastPathComponent, path: $0.path, isRequiredForOperation: false)
        }

        let launchDaemonsDir = appPath.appendingPathComponent("Contents/Library/LaunchDaemons")
        results += plistFiles(in: launchDaemonsDir).map {
            DetectedBackgroundItem(kind: .launchDaemon, identifier: launchdLabel(of: $0) ?? $0.deletingPathExtension().lastPathComponent, path: $0.path, isRequiredForOperation: false)
        }

        let helpersDir = appPath.appendingPathComponent("Contents/Library/LaunchServices")
        if let helpers = try? fileManager.contentsOfDirectory(at: helpersDir, includingPropertiesForKeys: nil) {
            results += helpers.map {
                DetectedBackgroundItem(kind: .privilegedHelper, identifier: $0.lastPathComponent, path: $0.path, isRequiredForOperation: true)
            }
        }

        let loginItemsDir = appPath.appendingPathComponent("Contents/Library/LoginItems")
        if let items = try? fileManager.contentsOfDirectory(at: loginItemsDir, includingPropertiesForKeys: nil) {
            results += items.filter { $0.pathExtension == "app" }.map {
                DetectedBackgroundItem(kind: .loginItem, identifier: $0.deletingPathExtension().lastPathComponent, path: $0.path, isRequiredForOperation: false)
            }
        }

        return results
    }

    // MARK: - Helpers

    private func extensionBundleCandidates(in directory: URL) -> [URL] {
        guard let items = try? fileManager.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) else {
            return []
        }

        return items.filter { item in
            let isAppExtensionBundle = ["appex", "systemextension"].contains(item.pathExtension.lowercased())
            let hasInfoPlist = fileManager.fileExists(atPath: item.appendingPathComponent("Contents/Info.plist").path)
            return isAppExtensionBundle || hasInfoPlist
        }
    }

    private func inspectExtensionBundle(_ bundlePath: URL) async -> DetectedSystemExtension? {
        let infoPlist = bundlePath.appendingPathComponent("Contents/Info.plist")
        guard fileManager.fileExists(atPath: infoPlist.path) else { return nil }
        guard let identifier = try? await plistBuddyRead(plist: infoPlist, key: "CFBundleIdentifier") else { return nil }

        let pointIdentifierRaw = try? await plistBuddyRead(plist: infoPlist, key: "NSExtension:NSExtensionPointIdentifier")
        let pointKind = SystemExtensionPointKind(rawValue: pointIdentifierRaw ?? "") ?? .unknown

        var providerKind: NetworkExtensionProviderKind?
        if pointKind == .networkExtension {
            let classesDump = try? await processRunner.run(
                "/usr/libexec/PlistBuddy",
                arguments: ["-c", "Print :NSExtension:NSExtensionAttributes:NetworkExtensionProviderClasses", infoPlist.path],
                currentDirectory: nil, environment: nil, onOutputLine: nil
            )
            let dump = classesDump?.stdout ?? ""
            if dump.contains("FilterDataProvider") || dump.contains("FilterControlProvider") {
                providerKind = .contentFilter
            } else if dump.contains("DNSProxyProvider") {
                providerKind = .dnsProxy
            } else if dump.contains("PacketTunnelProvider") {
                providerKind = .packetTunnel
            } else if dump.contains("AppProxyProvider") {
                providerKind = .appProxy
            } else {
                providerKind = .unknown
            }
        }

        let signatureOutput = try? await processRunner.run(
            "/usr/bin/codesign", arguments: ["-dv", "--verbose=2", bundlePath.path],
            currentDirectory: nil, environment: nil, onOutputLine: nil
        )
        let teamIdentifier = firstMatch(in: signatureOutput?.stderr ?? "", prefix: "TeamIdentifier=").flatMap { $0 == "not set" ? nil : $0 }

        return DetectedSystemExtension(
            identifier: identifier,
            pointKind: pointKind,
            networkProviderKind: providerKind,
            teamIdentifier: teamIdentifier,
            bundlePath: bundlePath.path
        )
    }

    private func plistFiles(in dir: URL) -> [URL] {
        (try? fileManager.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil))?.filter { $0.pathExtension == "plist" } ?? []
    }

    private func launchdLabel(of plistURL: URL) -> String? {
        guard let data = try? Data(contentsOf: plistURL),
              let plist = try? PropertyListSerialization.propertyList(from: data, options: [], format: nil) as? [String: Any] else {
            return nil
        }
        return plist["Label"] as? String
    }

    private func plistBuddyRead(plist: URL, key: String) async throws -> String {
        let output = try await processRunner.run(
            "/usr/libexec/PlistBuddy",
            arguments: ["-c", "Print :\(key)", plist.path],
            currentDirectory: nil,
            environment: nil,
            onOutputLine: nil
        )
        let value = output.stdout.trimmingCharacters(in: .whitespacesAndNewlines)
        guard output.exitCode == 0, !value.isEmpty else {
            throw AppInspectionError.notAnAppBundle(plist)
        }
        return value
    }

    private func firstMatch(in text: String, prefix: String) -> String? {
        for line in text.split(separator: "\n") where line.hasPrefix(prefix) {
            return String(line.dropFirst(prefix.count))
        }
        return nil
    }
}
