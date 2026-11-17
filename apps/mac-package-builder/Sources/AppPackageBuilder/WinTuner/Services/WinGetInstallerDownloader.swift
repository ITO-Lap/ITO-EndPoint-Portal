import Foundation

struct WinGetInstallerDownloadResult {
    let fileURL: URL
    let sha256Verified: Bool
}

enum WinGetInstallerDownloadError: LocalizedError {
    case invalidResponse
    case httpStatus(Int)
    case sha256Mismatch(expected: String, actual: String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "The installer download returned an invalid response."
        case .httpStatus(let status):
            return "The installer download returned HTTP status \(status)."
        case .sha256Mismatch:
            return "The downloaded installer failed SHA-256 verification."
        }
    }
}

protocol WinGetInstallerDownloading {
    func downloadInstaller(
        manifest: WinGetInstallerManifest,
        applicationName: String?,
        to directory: URL
    ) async throws -> WinGetInstallerDownloadResult
}

final class WinGetInstallerDownloader: WinGetInstallerDownloading {
    private let urlSession: URLSession
    private let fileManager: FileManager

    init(urlSession: URLSession = .shared, fileManager: FileManager = .default) {
        self.urlSession = urlSession
        self.fileManager = fileManager
    }

    func downloadInstaller(
        manifest: WinGetInstallerManifest,
        applicationName: String?,
        to directory: URL
    ) async throws -> WinGetInstallerDownloadResult {
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        let (temporaryURL, response) = try await urlSession.download(from: manifest.installerURL)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw WinGetInstallerDownloadError.invalidResponse
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            throw WinGetInstallerDownloadError.httpStatus(httpResponse.statusCode)
        }

        let fileExtension = manifest.installerURL.pathExtension.isEmpty
            ? "installer"
            : manifest.installerURL.pathExtension
        let proposedName = WinTunerOutputNaming.sanitizedFileName(
            applicationName: applicationName ?? manifest.packageId,
            version: manifest.version,
            architecture: manifest.architecture.scriptValue,
            fileExtension: fileExtension
        )
        let destinationURL = WinTunerOutputNaming.nextAvailableURL(
            for: directory.appendingPathComponent(proposedName),
            using: fileManager
        )
        try fileManager.copyItem(at: temporaryURL, to: destinationURL)

        var sha256Verified = false
        if let expectedHash = manifest.sha256, !expectedHash.isEmpty {
            let actualHash = try SHA256Verifier.hash(ofFileAt: destinationURL)
            guard SHA256Verifier.matches(actual: actualHash, expected: expectedHash) else {
                try? fileManager.removeItem(at: destinationURL)
                throw WinGetInstallerDownloadError.sha256Mismatch(expected: expectedHash, actual: actualHash)
            }
            sha256Verified = true
        }

        return WinGetInstallerDownloadResult(fileURL: destinationURL, sha256Verified: sha256Verified)
    }
}