import Foundation
import CryptoKit
import CommonCrypto

enum IntuneWinError: LocalizedError, Equatable {
    case sourceNotFound(String)
    case setupFileInvalid(String)
    case zipFailed(String)
    case cryptoFailed(Int32)
    case verificationFailed(String)

    var errorDescription: String? {
        switch self {
        case .sourceNotFound(let p): return "Source folder not found: \(p)"
        case .setupFileInvalid(let m): return "Setup file is not valid: \(m)"
        case .zipFailed(let m): return "Could not create the archive: \(m)"
        case .cryptoFailed(let c): return "Encryption failed (CommonCrypto status \(c))."
        case .verificationFailed(let m): return "The created package failed its self-check: \(m)"
        }
    }
}

/// The `<MsiInfo>` block that lets the Intune portal pre-fill the Program tab (install/uninstall commands) and an MSI
/// detection rule when the setup file is an `.msi`. Only the product code and version come from the MSI; the remaining
/// flags are written the way Microsoft's tool wrote them for per-machine MSIs.
struct IntuneWinMsiInfo: Equatable {
    let productCode: String
    let productVersion: String
}

struct IntuneWinResult: Equatable {
    let outputURL: URL
    let sizeBytes: Int64
    let sha256: String
    let unencryptedContentSize: Int64
    let setupFile: String
    /// True only after the package's HMAC, decrypted digest and archive integrity were re-checked from disk.
    let selfVerified: Bool
}

/// Builds an `.intunewin` container natively (no Windows, no Wine, no Microsoft tool).
///
/// Layout (the public Intune Win32 content format, see Microsoft Graph `mobileAppContentFile.encryptionInfo`):
///   IntuneWinPackage/Metadata/Detection.xml          – app info + base64 key material and digests
///   IntuneWinPackage/Contents/IntunePackage.intunewin – HMAC-SHA256 (32) ‖ IV (16) ‖ AES-256-CBC(zip of the source folder)
/// where Mac = HMAC-SHA256(macKey, IV ‖ ciphertext) and FileDigest = SHA-256 of the unencrypted zip.
/// Original implementation; it was validated against `.intunewin` files produced by other tools.
struct IntuneWinWriter {
    private let processRunner: ProcessRunning
    private static let chunk = 1024 * 1024
    static let toolVersion = "1.8.6.0"

    init(processRunner: ProcessRunning = ProcessRunner()) { self.processRunner = processRunner }

    // MARK: Create

    func create(sourceFolder: URL, setupFile: String, applicationName: String, outputFile: URL, msiInfo: IntuneWinMsiInfo? = nil) async throws -> IntuneWinResult {
        let fm = FileManager.default
        var isDir: ObjCBool = false
        guard fm.fileExists(atPath: sourceFolder.path, isDirectory: &isDir), isDir.boolValue else {
            throw IntuneWinError.sourceNotFound(sourceFolder.path)
        }
        let setupParts = setupFile.replacingOccurrences(of: "\\", with: "/").split(separator: "/", omittingEmptySubsequences: true)
        guard !setupFile.isEmpty, !setupFile.hasPrefix("/"), !setupParts.contains(".."), !setupParts.isEmpty else {
            throw IntuneWinError.setupFileInvalid("it must be a relative path inside the source folder")
        }
        guard fm.fileExists(atPath: sourceFolder.appendingPathComponent(setupFile).path) else {
            throw IntuneWinError.setupFileInvalid("\(setupFile) is not in the source folder")
        }

        let work = fm.temporaryDirectory.appendingPathComponent("intunewin-\(UUID().uuidString)", isDirectory: true)
        try fm.createDirectory(at: work, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: work) }

        // 1. Zip the source folder (contents at the archive root, no macOS metadata).
        let contentZip = work.appendingPathComponent("content.zip")
        let zip = try await processRunner.run(
            "/usr/bin/zip",
            arguments: ["-r", "-q", "-X", contentZip.path, ".", "-x", ".DS_Store", "-x", "*/.DS_Store", "-x", "__MACOSX/*"],
            currentDirectory: sourceFolder, environment: nil, onOutputLine: nil)
        guard zip.exitCode == 0, fm.fileExists(atPath: contentZip.path) else {
            throw IntuneWinError.zipFailed(zip.stderr.trimmingCharacters(in: .whitespacesAndNewlines))
        }

        // 2. Encrypt it (streaming — installers can be gigabytes).
        let stage = work.appendingPathComponent("stage", isDirectory: true)
        let contents = stage.appendingPathComponent("IntuneWinPackage/Contents", isDirectory: true)
        let metadata = stage.appendingPathComponent("IntuneWinPackage/Metadata", isDirectory: true)
        try fm.createDirectory(at: contents, withIntermediateDirectories: true)
        try fm.createDirectory(at: metadata, withIntermediateDirectories: true)
        let encrypted = contents.appendingPathComponent("IntunePackage.intunewin")
        let enc = try Self.encrypt(input: contentZip, output: encrypted)

        // 3. Detection.xml
        let xml = Self.detectionXML(applicationName: applicationName, setupFile: setupFile, enc: enc, msiInfo: msiInfo)
        try xml.write(to: metadata.appendingPathComponent("Detection.xml"), atomically: true, encoding: .utf8)

        // 4. Self-check BEFORE publishing the result: recompute the HMAC, decrypt and compare the digest.
        try Self.verifyEncryptedFile(encrypted, enc: enc)

        // 5. Outer archive.
        try fm.createDirectory(at: outputFile.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? fm.removeItem(at: outputFile)
        let outer = try await processRunner.run(
            "/usr/bin/zip", // Same shape as packages made by other tools: exactly two stored (uncompressed) entries, Contents first, no directory entries.
            arguments: ["-q", "-X", "-D", "-0", outputFile.path, "IntuneWinPackage/Contents/IntunePackage.intunewin", "IntuneWinPackage/Metadata/Detection.xml"],
            currentDirectory: stage, environment: nil, onOutputLine: nil)
        guard outer.exitCode == 0, fm.fileExists(atPath: outputFile.path) else {
            throw IntuneWinError.zipFailed(outer.stderr.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        let test = try await processRunner.run("/usr/bin/unzip", arguments: ["-tq", outputFile.path], currentDirectory: nil, environment: nil, onOutputLine: nil)
        guard test.exitCode == 0 else { throw IntuneWinError.verificationFailed("the final archive failed an integrity test") }

        let size = (try fm.attributesOfItem(atPath: outputFile.path)[.size] as? NSNumber)?.int64Value ?? 0
        return IntuneWinResult(outputURL: outputFile, sizeBytes: size, sha256: try Self.sha256Hex(of: outputFile),
                               unencryptedContentSize: enc.plainSize, setupFile: setupFile, selfVerified: true)
    }

    // MARK: Crypto

    struct EncryptionInfo: Equatable {
        let key: Data, macKey: Data, iv: Data, mac: Data, digest: Data
        let plainSize: Int64
    }

    static func randomBytes(_ n: Int) throws -> Data {
        var d = Data(count: n)
        let status = d.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, n, $0.baseAddress!) }
        guard status == errSecSuccess else { throw IntuneWinError.cryptoFailed(status) }
        return d
    }

    /// Writes `HMAC(32) ‖ IV(16) ‖ ciphertext` to `output` and returns the key material.
    static func encrypt(input: URL, output: URL, key: Data? = nil, macKey: Data? = nil, iv: Data? = nil) throws -> EncryptionInfo {
        let key = try key ?? randomBytes(32), macKey = try macKey ?? randomBytes(32), iv = try iv ?? randomBytes(16)
        FileManager.default.createFile(atPath: output.path, contents: nil)
        let out = try FileHandle(forWritingTo: output)
        defer { try? out.close() }
        try out.write(contentsOf: Data(count: 32))      // MAC placeholder, filled in at the end
        try out.write(contentsOf: iv)

        var cryptor: CCCryptorRef?
        let created = key.withUnsafeBytes { k in iv.withUnsafeBytes { v in
            CCCryptorCreate(CCOperation(kCCEncrypt), CCAlgorithm(kCCAlgorithmAES), CCOptions(kCCOptionPKCS7Padding), k.baseAddress, key.count, v.baseAddress, &cryptor)
        } }
        guard created == kCCSuccess, let cryptor else { throw IntuneWinError.cryptoFailed(created) }
        defer { CCCryptorRelease(cryptor) }

        var hmac = HMAC<SHA256>(key: SymmetricKey(data: macKey))
        hmac.update(data: iv)
        var plainHash = SHA256()
        var plainSize: Int64 = 0

        let reader = try FileHandle(forReadingFrom: input)
        defer { try? reader.close() }
        func emit(_ buf: [UInt8], _ n: Int) throws {
            guard n > 0 else { return }
            let d = Data(buf[0..<n]); hmac.update(data: d); try out.write(contentsOf: d)
        }
        while true {
            let plain = try reader.read(upToCount: chunk) ?? Data()
            if plain.isEmpty { break }
            plainHash.update(data: plain); plainSize += Int64(plain.count)
            var buf = [UInt8](repeating: 0, count: CCCryptorGetOutputLength(cryptor, plain.count, false))
            var moved = 0
            let s = plain.withUnsafeBytes { CCCryptorUpdate(cryptor, $0.baseAddress, plain.count, &buf, buf.count, &moved) }
            guard s == kCCSuccess else { throw IntuneWinError.cryptoFailed(s) }
            try emit(buf, moved)
        }
        var tail = [UInt8](repeating: 0, count: 32)
        var tailMoved = 0
        let f = CCCryptorFinal(cryptor, &tail, tail.count, &tailMoved)
        guard f == kCCSuccess else { throw IntuneWinError.cryptoFailed(f) }
        try emit(tail, tailMoved)

        let mac = Data(hmac.finalize())
        try out.seek(toOffset: 0)
        try out.write(contentsOf: mac)
        return EncryptionInfo(key: key, macKey: macKey, iv: iv, mac: mac, digest: Data(plainHash.finalize()), plainSize: plainSize)
    }

    /// Re-reads `file` from disk: checks the stored MAC and IV, recomputes the HMAC, decrypts and compares the SHA-256 and size.
    static func verifyEncryptedFile(_ file: URL, enc: EncryptionInfo) throws {
        let reader = try FileHandle(forReadingFrom: file)
        defer { try? reader.close() }
        let header = try reader.read(upToCount: 48) ?? Data()
        guard header.count == 48 else { throw IntuneWinError.verificationFailed("encrypted file is too short") }
        guard header.prefix(32) == enc.mac else { throw IntuneWinError.verificationFailed("stored MAC does not match") }
        guard header.suffix(16) == enc.iv else { throw IntuneWinError.verificationFailed("stored IV does not match") }

        var hmac = HMAC<SHA256>(key: SymmetricKey(data: enc.macKey))
        hmac.update(data: enc.iv)
        var cryptor: CCCryptorRef?
        let created = enc.key.withUnsafeBytes { k in enc.iv.withUnsafeBytes { v in
            CCCryptorCreate(CCOperation(kCCDecrypt), CCAlgorithm(kCCAlgorithmAES), CCOptions(kCCOptionPKCS7Padding), k.baseAddress, enc.key.count, v.baseAddress, &cryptor)
        } }
        guard created == kCCSuccess, let cryptor else { throw IntuneWinError.cryptoFailed(created) }
        defer { CCCryptorRelease(cryptor) }
        var plainHash = SHA256(); var plainSize: Int64 = 0
        func absorb(_ buf: [UInt8], _ n: Int) { if n > 0 { plainHash.update(data: Data(buf[0..<n])); plainSize += Int64(n) } }
        while true {
            let cipher = try reader.read(upToCount: chunk) ?? Data()
            if cipher.isEmpty { break }
            hmac.update(data: cipher)
            var buf = [UInt8](repeating: 0, count: CCCryptorGetOutputLength(cryptor, cipher.count, false))
            var moved = 0
            let s = cipher.withUnsafeBytes { CCCryptorUpdate(cryptor, $0.baseAddress, cipher.count, &buf, buf.count, &moved) }
            guard s == kCCSuccess else { throw IntuneWinError.cryptoFailed(s) }
            absorb(buf, moved)
        }
        var tail = [UInt8](repeating: 0, count: 32); var tailMoved = 0
        let f = CCCryptorFinal(cryptor, &tail, tail.count, &tailMoved)
        guard f == kCCSuccess else { throw IntuneWinError.verificationFailed("decryption failed (status \(f))") }
        absorb(tail, tailMoved)
        guard Data(hmac.finalize()) == enc.mac else { throw IntuneWinError.verificationFailed("HMAC mismatch") }
        guard Data(plainHash.finalize()) == enc.digest, plainSize == enc.plainSize else { throw IntuneWinError.verificationFailed("decrypted content does not match the original") }
    }

    // MARK: Helpers

    static func xmlEscape(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;")
         .replacingOccurrences(of: "\"", with: "&quot;").replacingOccurrences(of: "'", with: "&apos;")
    }

    static func detectionXML(applicationName: String, setupFile: String, enc: EncryptionInfo, msiInfo: IntuneWinMsiInfo? = nil) -> String {
        let msi = msiInfo.map { m in """

          <MsiInfo>
            <MsiProductCode>\(xmlEscape(m.productCode))</MsiProductCode>
            <MsiProductVersion>\(xmlEscape(m.productVersion))</MsiProductVersion>
            <MsiExecutionContext>System</MsiExecutionContext>
            <MsiRequiresLogon>false</MsiRequiresLogon>
            <MsiRequiresReboot>false</MsiRequiresReboot>
            <MsiIsMachineInstall>false</MsiIsMachineInstall>
            <MsiIsUserInstall>false</MsiIsUserInstall>
            <MsiIncludesServices>false</MsiIncludesServices>
            <MsiIncludesODBCDataSource>false</MsiIncludesODBCDataSource>
            <MsiContainsSystemRegistryKeys>false</MsiContainsSystemRegistryKeys>
            <MsiContainsSystemFolders>false</MsiContainsSystemFolders>
          </MsiInfo>
        """ } ?? ""
        return """
        <ApplicationInfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" ToolVersion="\(toolVersion)">
          <Name>\(xmlEscape(applicationName))</Name>
          <UnencryptedContentSize>\(enc.plainSize)</UnencryptedContentSize>
          <FileName>IntunePackage.intunewin</FileName>
          <SetupFile>\(xmlEscape(setupFile))</SetupFile>
          <EncryptionInfo>
            <EncryptionKey>\(enc.key.base64EncodedString())</EncryptionKey>
            <MacKey>\(enc.macKey.base64EncodedString())</MacKey>
            <InitializationVector>\(enc.iv.base64EncodedString())</InitializationVector>
            <Mac>\(enc.mac.base64EncodedString())</Mac>
            <ProfileIdentifier>ProfileVersion1</ProfileIdentifier>
            <FileDigest>\(enc.digest.base64EncodedString())</FileDigest>
            <FileDigestAlgorithm>SHA256</FileDigestAlgorithm>
          </EncryptionInfo>\(msi)
        </ApplicationInfo>
        """
    }

    static func sha256Hex(of file: URL) throws -> String {
        let h = try FileHandle(forReadingFrom: file); defer { try? h.close() }
        var sha = SHA256()
        while let d = try h.read(upToCount: chunk), !d.isEmpty { sha.update(data: d) }
        return sha.finalize().map { String(format: "%02x", $0) }.joined()
    }
}
