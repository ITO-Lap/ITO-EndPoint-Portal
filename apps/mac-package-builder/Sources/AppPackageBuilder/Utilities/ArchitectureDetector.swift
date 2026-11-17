import Foundation

enum PackageArchitecture: String, CaseIterable, Codable, Identifiable {
    case appleSilicon = "arm64"
    case intel = "x86_64"
    case universal = "universal"
    case automatic = "automatic"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .appleSilicon: return "Apple Silicon"
        case .intel: return "Intel"
        case .universal: return "Universal"
        case .automatic: return "Automatic"
        }
    }
}

enum ArchitectureDetector {

    /// The architecture of the Mac this app is currently running on.
    static var currentHostArchitecture: PackageArchitecture {
        #if arch(arm64)
        return .appleSilicon
        #else
        return .intel
        #endif
    }

    /// Resolves an "automatic" selection down to a concrete architecture using
    /// cask/formula metadata (variant URLs, `depends_on.arch`) when available,
    /// falling back to the build machine's own architecture.
    static func resolveAutomatic(hasArmVariant: Bool, hasIntelVariant: Bool) -> PackageArchitecture {
        if hasArmVariant && hasIntelVariant { return .universal }
        if hasArmVariant { return .appleSilicon }
        if hasIntelVariant { return .intel }
        return currentHostArchitecture
    }
}
