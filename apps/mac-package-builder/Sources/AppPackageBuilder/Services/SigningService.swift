import Foundation

struct SigningIdentity: Identifiable, Hashable {
    var id: String { sha1 }
    let sha1: String
    let commonName: String
}

protocol SigningServicing {
    func availableInstallerIdentities() async -> [SigningIdentity]
    func sign(packageAt path: URL, identity: SigningIdentity, outputPath: URL) async throws
    func verifySignature(of path: URL) async throws -> String
}

/// Wraps `security find-identity` and `productsign`. Never stores or logs
/// certificate material — only the SHA-1 hash and common name needed to let
/// the user pick an identity, both of which `security` already prints in
/// the clear for any locally-installed certificate.
final class SigningService: SigningServicing {
    private let processRunner: ProcessRunning

    init(processRunner: ProcessRunning = ProcessRunner()) {
        self.processRunner = processRunner
    }

    func availableInstallerIdentities() async -> [SigningIdentity] {
        guard FileManager.default.isExecutableFile(atPath: "/usr/bin/security") else { return [] }
        do {
            let output = try await processRunner.run(
                "/usr/bin/security",
                arguments: ["find-identity", "-v", "-p", "basic"],
                currentDirectory: nil,
                environment: nil,
                onOutputLine: nil
            )
            return parseIdentities(from: output.stdout)
        } catch {
            return []
        }
    }

    private func parseIdentities(from output: String) -> [SigningIdentity] {
        // Lines look like: `  1) AABBCC...HASH "Developer ID Installer: AKVERMA LLC (TEAMID)"`
        var results: [SigningIdentity] = []
        for line in output.split(separator: "\n") {
            guard line.contains("Developer ID Installer") else { continue }
            let parts = line.split(separator: "\"")
            guard parts.count >= 2 else { continue }
            let commonName = String(parts[1])
            let beforeQuote = parts[0]
            guard let hash = beforeQuote.split(separator: " ").first(where: { $0.count == 40 && $0.allSatisfy(\.isHexDigit) }) else { continue }
            results.append(SigningIdentity(sha1: String(hash), commonName: commonName))
        }
        return results
    }

    func sign(packageAt path: URL, identity: SigningIdentity, outputPath: URL) async throws {
        let output = try await processRunner.run(
            "/usr/bin/productsign",
            arguments: ["--sign", identity.sha1, path.path, outputPath.path],
            currentDirectory: nil,
            environment: nil,
            onOutputLine: nil
        )
        guard output.exitCode == 0 else {
            throw NSError(domain: "SigningService", code: Int(output.exitCode), userInfo: [NSLocalizedDescriptionKey: output.stderr.isEmpty ? "productsign failed" : output.stderr])
        }
    }

    func verifySignature(of path: URL) async throws -> String {
        let output = try await processRunner.run(
            "/usr/sbin/pkgutil",
            arguments: ["--check-signature", path.path],
            currentDirectory: nil,
            environment: nil,
            onOutputLine: nil
        )
        return output.stdout
    }
}
