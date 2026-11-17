import Foundation

protocol NotarizationServicing {
    func submitAndWait(packagePath: URL, keychainProfile: String, onOutputLine: @escaping @Sendable (String) -> Void) async throws
    func staple(packagePath: URL) async throws
    func validateStapledTicket(packagePath: URL) async throws -> String
}

/// Wraps `xcrun notarytool` / `xcrun stapler`. Requires the administrator to
/// have already stored their Apple ID app-specific password or API key under
/// a named Keychain profile via `xcrun notarytool store-credentials` outside
/// this app — App Package Builder never asks for, stores, or transmits that
/// credential itself, only the profile *name*.
final class NotarizationService: NotarizationServicing {
    private let processRunner: ProcessRunning

    init(processRunner: ProcessRunning = ProcessRunner()) {
        self.processRunner = processRunner
    }

    func submitAndWait(packagePath: URL, keychainProfile: String, onOutputLine: @escaping @Sendable (String) -> Void) async throws {
        let output = try await processRunner.run(
            "/usr/bin/xcrun",
            arguments: ["notarytool", "submit", packagePath.path, "--keychain-profile", keychainProfile, "--wait"],
            currentDirectory: nil,
            environment: nil,
            onOutputLine: onOutputLine
        )
        guard output.exitCode == 0 else {
            throw NSError(domain: "NotarizationService", code: Int(output.exitCode), userInfo: [NSLocalizedDescriptionKey: output.stderr.isEmpty ? "notarytool submission failed" : output.stderr])
        }
    }

    func staple(packagePath: URL) async throws {
        let output = try await processRunner.run(
            "/usr/bin/xcrun",
            arguments: ["stapler", "staple", packagePath.path],
            currentDirectory: nil,
            environment: nil,
            onOutputLine: nil
        )
        guard output.exitCode == 0 else {
            throw NSError(domain: "NotarizationService", code: Int(output.exitCode), userInfo: [NSLocalizedDescriptionKey: output.stderr.isEmpty ? "stapler failed" : output.stderr])
        }
    }

    /// Confirms the notarization ticket actually stapled to the artifact on
    /// disk validates offline, rather than only trusting that `staple()`
    /// exited zero — the two are usually the same moment, but this makes the
    /// build manifest/report state a checked fact, not an assumption.
    func validateStapledTicket(packagePath: URL) async throws -> String {
        let output = try await processRunner.run(
            "/usr/bin/xcrun",
            arguments: ["stapler", "validate", packagePath.path],
            currentDirectory: nil,
            environment: nil,
            onOutputLine: nil
        )
        let combined = [output.stdout, output.stderr].filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }.joined(separator: "\n")
        guard output.exitCode == 0 else {
            throw NSError(domain: "NotarizationService", code: Int(output.exitCode), userInfo: [NSLocalizedDescriptionKey: combined.isEmpty ? "stapler validate failed" : combined])
        }
        return combined.isEmpty ? "The validate action worked!" : combined
    }
}
