import Foundation

/// Filename conventions for the WinGet Packager (Local) module. Sibling to
/// `PackageOutputPathing` (which is scoped to `.pkg` output for the Homebrew
/// module) — this mirrors the same sanitization approach for
/// `<ApplicationName>-<Version>-<Architecture>.<ext>` naming instead of
/// duplicating the sanitizer logic.
enum WinTunerOutputNaming {

    /// Resolves the per-application folder below the user-selected output
    /// directory, falling back to the WinGet package ID when no display name
    /// was resolved from the manifest.
    static func applicationOutputDirectory(
        baseDirectory: String,
        applicationName: String?,
        packageId: String
    ) -> String {
        let basePath = (baseDirectory as NSString).expandingTildeInPath
        let sanitizedName = PackageOutputPathing.sanitizedFileNameComponent(
            applicationName ?? "",
            fallback: packageId
        )
        let folderName = sanitizedName
            .replacingOccurrences(of: #"-{2,}"#, with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-."))
        return URL(fileURLWithPath: basePath, isDirectory: true)
            .appendingPathComponent(folderName, isDirectory: true)
            .path
    }

    /// `<ApplicationName>-<Version>-<Architecture>.<ext>`, with each
    /// component sanitized the same way `PackageOutputPathing`'s file-name
    /// sanitizer does (letters/numbers/`-`/`.`/`_` only, spaces replaced
    /// with `-`).
    static func sanitizedFileName(
        applicationName: String,
        version: String,
        architecture: String,
        fileExtension: String
    ) -> String {
        let namePart = PackageOutputPathing.sanitizedFileNameComponent(applicationName, fallback: "package")
        let versionPart = PackageOutputPathing.sanitizedFileNameComponent(version, fallback: "0")
        let archPart = PackageOutputPathing.sanitizedFileNameComponent(architecture, fallback: "unknown")
        let ext = fileExtension.trimmingCharacters(in: CharacterSet(charactersIn: "."))
        return "\(namePart)-\(versionPart)-\(archPart).\(ext)"
    }

    /// Returns `proposedURL` unchanged if nothing exists there yet;
    /// otherwise returns the first available `name-2.ext`, `name-3.ext`, ...
    /// candidate. Backs the "never silently overwrite — replace or suffix"
    /// UI requirement; the actual prompt is a later agent's View/ViewModel
    /// concern, this just computes the safe candidate.
    static func nextAvailableURL(for proposedURL: URL, using fileManager: FileManager = .default) -> URL {
        guard fileManager.fileExists(atPath: proposedURL.path) else { return proposedURL }

        let directory = proposedURL.deletingLastPathComponent()
        let ext = proposedURL.pathExtension
        let baseName = proposedURL.deletingPathExtension().lastPathComponent

        var counter = 2
        while true {
            let candidateName = ext.isEmpty ? "\(baseName)-\(counter)" : "\(baseName)-\(counter).\(ext)"
            let candidate = directory.appendingPathComponent(candidateName)
            if !fileManager.fileExists(atPath: candidate.path) {
                return candidate
            }
            counter += 1
        }
    }
}
