import Foundation

enum RequirementStatus: String, Codable {
    case pass
    case warning
    case fail
    case checking

    var colorName: String {
        switch self {
        case .pass: return "green"
        case .warning: return "amber"
        case .fail: return "red"
        case .checking: return "gray"
        }
    }
}

struct RequirementCheck: Identifiable, Equatable {
    var id: String { name }
    let name: String
    var status: RequirementStatus
    var detail: String
}

/// Convenience keys so ViewModel and Views agree on requirement identity
/// without magic strings scattered around.
enum RequirementKey: String, CaseIterable {
    case internetAccess = "Internet Access"
    case homebrewAvailable = "Homebrew"
    case pkgbuild = "pkgbuild"
    case productbuild = "productbuild"
    case productsign = "productsign"
    case signingCertificate = "Signing Certificate"
    case notarizationCredentials = "Notarization Credentials"
    case pppcProfile = "PPPC Profile"
    case systemExtension = "System Extension"
    case networkExtension = "Network Extension"
    case supportedArchitecture = "Supported Architecture"
}

struct ValidationSummary: Equatable {
    var checks: [RequirementCheck] = []

    var canBuild: Bool {
        !checks.contains { $0.status == .fail }
    }

    var overallStatus: RequirementStatus {
        if checks.contains(where: { $0.status == .fail }) { return .fail }
        if checks.contains(where: { $0.status == .warning }) { return .warning }
        if checks.isEmpty { return .checking }
        return .pass
    }
}
