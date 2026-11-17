import Foundation

/// Derives stable artifact names from verified package metadata.  This is
/// deliberately independent of the agent so every export uses the same safe
/// identity and tests do not need a Windows host.
struct WindowsPackageNamingService {
    enum NamingError: LocalizedError, Equatable {
        case missingVersion
        case invalidCustomName

        var errorDescription: String? {
            switch self {
            case .missingVersion: return "A verified application version is required before packaging."
            case .invalidCustomName: return "The export filename is invalid."
            }
        }
    }

    func fileName(application: String, version: String, architecture: WinGetPackageDetail.Architecture, ext: String, customName: String? = nil) throws -> String {
        guard WinGetValidators.isValidVersion(version) else { throw NamingError.missingVersion }
        let cleanExtension = ext.trimmingCharacters(in: CharacterSet(charactersIn: ". ")).lowercased()
        let base: String
        if let customName, !customName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            guard !customName.contains(".."), !customName.contains("/"), !customName.contains("\\") else { throw NamingError.invalidCustomName }
            base = sanitize(customName)
            guard !base.isEmpty else { throw NamingError.invalidCustomName }
        } else {
            base = sanitize("\(application)-\(version)-\(architecture.rawValue)")
        }
        guard !base.contains(".."), !base.contains("/") && !base.contains("\\") else { throw NamingError.invalidCustomName }
        return "\(base).\(cleanExtension)"
    }

    func sanitize(_ value: String) -> String {
        let invalid = CharacterSet(charactersIn: "\\/:*?\"<>|")
        let pieces = value.components(separatedBy: invalid).joined(separator: "")
            .split(whereSeparator: { $0.isWhitespace }).joined(separator: "-")
        return pieces.trimmingCharacters(in: CharacterSet(charactersIn: ".- "))
    }
}
