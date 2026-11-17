import Foundation

/// Abstraction over the bundled `setup-winget-packager-macos.sh` bridge
/// script, mirroring `HomebrewServicing`'s style: every mutating action
/// requires an explicit caller-driven confirmation upstream (this protocol
/// itself performs no confirmation — that's a ViewModel/View concern) and
/// every invocation goes through `ProcessRunning` with a discrete argument
/// array, never an interpolated shell string.
protocol WinTunerCommandRunning {
    func checkDependencies() async throws -> DependencyStatus
    func installDependencies(log: @escaping @Sendable (String) -> Void) async throws
    func updateWinTuner(log: @escaping @Sendable (String) -> Void) async throws
    func runTestPackage(
        outputDirectory: String,
        log: @escaping @Sendable (String) -> Void,
        isCancelled: @escaping () -> Bool
    ) async throws -> WinTunerPackageResult
    func package(
        configuration: WinTunerPackageConfiguration,
        manifest: WinGetInstallerManifest,
        log: @escaping @Sendable (String) -> Void,
        isCancelled: @escaping () -> Bool
    ) async throws -> WinTunerPackageResult
}
