import Foundation

/// Outcome of a single `package`/`test` run of the WinGet Packager (Local)
/// bridge script. Every field here reflects what was actually observed —
/// none are optimistically assumed from a zero exit code alone.
///
/// `windowsInstallationTested` is intentionally a `let` constant hardcoded to
/// `false`, with no initializer parameter for it: this module runs entirely
/// on macOS and never drives a real Windows install, so no code path may
/// ever construct this type claiming Windows installation was tested.
struct WinTunerPackageResult: Equatable {
    let manifestResolved: Bool
    let installerDownloaded: Bool
    let sha256Verified: Bool
    let scriptsGenerated: Bool
    let intuneWinCreated: Bool
    let windowsInstallationTested: Bool = false

    let stdout: String
    let stderr: String
    let exitCode: Int32
    let outputFileURLs: [URL]
    let startedAt: Date
    let finishedAt: Date?

    init(
        manifestResolved: Bool,
        installerDownloaded: Bool,
        sha256Verified: Bool,
        scriptsGenerated: Bool,
        intuneWinCreated: Bool,
        stdout: String,
        stderr: String,
        exitCode: Int32,
        outputFileURLs: [URL],
        startedAt: Date,
        finishedAt: Date?
    ) {
        self.manifestResolved = manifestResolved
        self.installerDownloaded = installerDownloaded
        self.sha256Verified = sha256Verified
        self.scriptsGenerated = scriptsGenerated
        self.intuneWinCreated = intuneWinCreated
        self.stdout = stdout
        self.stderr = stderr
        self.exitCode = exitCode
        self.outputFileURLs = outputFileURLs
        self.startedAt = startedAt
        self.finishedAt = finishedAt
    }
}
