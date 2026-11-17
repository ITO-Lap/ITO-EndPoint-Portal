import Foundation

/// Mirrors the exact JSON shape produced by
/// `setup-winget-packager-macos.sh check --json`, e.g.:
/// `{"macOS":true,"homebrew":true,"powershell":true,"winTuner":true,"powershellVersion":"7.6.6","winTunerVersion":"1.4.1","ready":true}`
struct DependencyStatus: Codable, Equatable {
    let macOS: Bool
    let homebrew: Bool
    let powershell: Bool
    let winTuner: Bool
    let powershellVersion: String
    let winTunerVersion: String
    let ready: Bool

    /// Sentinel for the "not yet checked" UI state, before `checkDependencies()`
    /// has run for the first time.
    static let notChecked = DependencyStatus(
        macOS: false,
        homebrew: false,
        powershell: false,
        winTuner: false,
        powershellVersion: "",
        winTunerVersion: "",
        ready: false
    )
}
