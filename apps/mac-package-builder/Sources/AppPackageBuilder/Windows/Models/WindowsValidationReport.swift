import Foundation

/// Result of the agent-side hash + Authenticode validation pass for one
/// downloaded installer, surfaced on the Validate wizard step and embedded
/// in the exported HTML report (mirrors `ReportService`'s renderer pattern
/// for the macOS flow).
struct WindowsValidationReport: Codable, Equatable {
    var actualSHA256: String
    var expectedSHA256: String?
    var authenticodeStatus: AuthenticodeStatus
    var publisher: String?
    var signingCertificateSubject: String?
    var timestamp: Date?
    var certificateExpiration: Date?
    var installerType: WinGetPackageDetail.InstallerType
    var fileVersion: String?
    var productVersion: String?
    var msiProductCode: String?

    /// Documented override for the rare case where an admin explicitly
    /// accepts an installer that failed automated validation (e.g. an
    /// unsigned but trusted internal tool). Never applied silently — the
    /// UI must capture a reason, the approver, and the timestamp.
    var adminOverride: AdminOverride?

    /// Whether the SHA-256 computed from the downloaded bytes matches the
    /// value recorded in the WinGet manifest. `false`/`nil` mismatches (or a
    /// missing expected hash) must block packaging unless `adminOverride` is
    /// present.
    var hashMatches: Bool {
        guard let expectedSHA256 else { return false }
        return actualSHA256.caseInsensitiveCompare(expectedSHA256) == .orderedSame
    }

    enum AuthenticodeStatus: String, Codable, CaseIterable {
        case validSigned
        case invalidSigned
        case unsigned
        case unknown

        var displayName: String {
            switch self {
            case .validSigned: return "Valid Signature"
            case .invalidSigned: return "Invalid Signature"
            case .unsigned: return "Unsigned"
            case .unknown: return "Unknown"
            }
        }
    }

    struct AdminOverride: Codable, Equatable {
        var reason: String
        var approvedBy: String
        var approvedAt: Date
    }
}
