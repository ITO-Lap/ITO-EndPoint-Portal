import Foundation

/// The single source of truth for where a build's `.pkg` will land —
/// `PackageBuilderService` (to actually write it) and `MainActionsBar` (to
/// predict it for the pre-build overwrite check) both call this, so the two
/// can never drift out of sync the way they previously did.
enum PackageOutputPathing {

    /// `<outputDirectory>/<homebrewToken>/<ApplicationName>-<PackageVersion>.pkg`
    /// — `nil` if `outputDirectory` can't be canonicalized (e.g. still empty).
    static func expectedPackagePath(for configuration: PackageConfiguration) -> URL? {
        guard let baseOutputDir = try? PathValidator.canonicalize(configuration.outputDirectory) else { return nil }
        let appOutputDir = baseOutputDir.appendingPathComponent(configuration.homebrewToken, isDirectory: true)
        let pkgBaseName = sanitizedFileNameComponent(
            "\(configuration.applicationName)-\(configuration.packageVersion)",
            fallback: configuration.homebrewToken
        )
        return appOutputDir.appendingPathComponent("\(pkgBaseName).pkg")
    }

    /// `applicationName` comes from Homebrew metadata (e.g. "Visual Studio
    /// Code") and isn't restricted to the strict token charset
    /// `Validators.isValidToken` enforces — sanitize before it becomes part
    /// of a filename. Falls back to `fallback` (the already-validated
    /// Homebrew token) if sanitizing leaves nothing usable.
    static func sanitizedFileNameComponent(_ raw: String, fallback: String) -> String {
        let sanitized = raw
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: " ", with: "-")
            .filter { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "." || $0 == "_" }
        return sanitized.isEmpty ? fallback : sanitized
    }
}
