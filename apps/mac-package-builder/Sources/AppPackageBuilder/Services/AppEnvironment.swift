import Foundation
import AppKit

/// Central place for packaged-app paths, logging, crash capture, and the
/// first-launch resource check. Nothing here ever writes inside the `.app`
/// bundle; all mutable state lives under the user's Library.
///
/// The folder name `AppPackageBuilder` is intentionally the same one the
/// history/template/catalog services already use, so upgrades keep user data.
enum AppEnvironment {
    static let folderName = "AppPackageBuilder"

    static var supportDirectory: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Application Support")
        return base.appendingPathComponent(folderName, isDirectory: true)
    }

    static var logsDirectory: URL {
        let base = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library")
        return base.appendingPathComponent("Logs", isDirectory: true)
            .appendingPathComponent(folderName, isDirectory: true)
    }

    static var logFileURL: URL { logsDirectory.appendingPathComponent("app.log") }

    static var versionString: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "dev"
        let build = info?["CFBundleVersion"] as? String ?? "0"
        return "\(short) (\(build))"
    }

    /// Creates writable directories and installs logging/crash hooks.
    /// Returns an error message when the user's Library is not writable.
    @discardableResult
    static func bootstrap() -> String? {
        do {
            try FileManager.default.createDirectory(at: supportDirectory, withIntermediateDirectories: true)
            try FileManager.default.createDirectory(at: logsDirectory, withIntermediateDirectories: true)
        } catch {
            return "App Package Builder can't write to \(supportDirectory.path): \(error.localizedDescription)"
        }
        AppLog.rotateIfNeeded()
        AppLog.info("Launch v\(versionString) macOS \(ProcessInfo.processInfo.operatingSystemVersionString) bundle=\(Bundle.main.bundlePath)")
        installCrashHandlers()
        return nil
    }

    // MARK: First-launch validation

    struct ValidationIssue { let message: String }

    /// Confirms the bundled resources the app depends on are present. Only
    /// meaningful for a packaged `.app`; `swift run` builds are skipped.
    static func validateBundle() -> [ValidationIssue] {
        guard Bundle.main.bundleURL.pathExtension == "app" else { return [] }
        var issues: [ValidationIssue] = []
        let fm = FileManager.default
        let resources = Bundle.main.resourceURL
        let bundleDir = resources?.appendingPathComponent("AppPackageBuilder_AppPackageBuilder.bundle")
        if let bundleDir, fm.fileExists(atPath: bundleDir.path), let resourceBundle = Bundle(url: bundleDir) {
            if resourceBundle.url(forResource: "setup-winget-packager-macos", withExtension: "sh") == nil
                && resourceBundle.url(forResource: "setup-winget-packager-macos", withExtension: "sh", subdirectory: "Scripts") == nil {
                issues.append(.init(message: "Bundled setup script is missing."))
            }
        } else {
            issues.append(.init(message: "Resource bundle is missing from the application."))
        }
        if Bundle.main.object(forInfoDictionaryKey: "CFBundleIconFile") == nil {
            AppLog.warning("No app icon declared in Info.plist")
        }
        for issue in issues { AppLog.error("Validation: \(issue.message)") }
        return issues
    }

    /// Optional-tool report for the log (Homebrew is needed for cask search).
    static func logOptionalTools() {
        let brew = ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"].first {
            FileManager.default.isExecutableFile(atPath: $0)
        }
        AppLog.info("Homebrew: \(brew ?? "not installed (cask search disabled)")")
    }

    @MainActor
    static func presentStartupProblems(_ problems: [String]) {
        guard !problems.isEmpty else { return }
        let alert = NSAlert()
        alert.alertStyle = .critical
        alert.messageText = "App Package Builder can't start correctly"
        alert.informativeText = problems.joined(separator: "\n") +
            "\n\nReinstall the app. Details: \(logFileURL.path)"
        alert.addButton(withTitle: "Show Log")
        alert.addButton(withTitle: "Quit")
        if alert.runModal() == .alertFirstButtonReturn {
            NSWorkspace.shared.activateFileViewerSelecting([logFileURL])
        }
    }

    // MARK: Crash capture

    private static func installCrashHandlers() {
        NSSetUncaughtExceptionHandler { exception in
            AppLog.error("Uncaught exception \(exception.name.rawValue): \(exception.reason ?? "")\n" +
                         exception.callStackSymbols.joined(separator: "\n"))
        }
        for sig in [SIGSEGV, SIGABRT, SIGILL, SIGBUS, SIGTRAP] {
            signal(sig) { received in
                AppLog.writeRaw("FATAL signal \(received)\n")
                signal(received, SIG_DFL)
                raise(received)
            }
        }
    }
}

/// Minimal append-only file logger (≈1 MB cap with one rotated generation).
enum AppLog {
    private static let queue = DispatchQueue(label: "AppLog")
    private static let maxBytes = 1_000_000

    static func info(_ message: String) { write("INFO", message) }
    static func warning(_ message: String) { write("WARN", message) }
    static func error(_ message: String) { write("ERROR", message) }

    static func rotateIfNeeded() {
        let url = AppEnvironment.logFileURL
        guard let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size]) as? Int,
              size > maxBytes else { return }
        let old = url.appendingPathExtension("1")
        try? FileManager.default.removeItem(at: old)
        try? FileManager.default.moveItem(at: url, to: old)
    }

    private static func write(_ level: String, _ message: String) {
        let line = "\(ISO8601DateFormatter().string(from: Date())) [\(level)] \(message)\n"
        queue.async { writeRaw(line) }
    }

    /// Synchronous and async-signal-tolerant enough for crash paths.
    static func writeRaw(_ text: String) {
        let url = AppEnvironment.logFileURL
        guard let data = text.data(using: .utf8) else { return }
        if let handle = try? FileHandle(forWritingTo: url) {
            _ = try? handle.seekToEnd()
            try? handle.write(contentsOf: data)
            try? handle.close()
        } else {
            try? data.write(to: url)
        }
    }
}
