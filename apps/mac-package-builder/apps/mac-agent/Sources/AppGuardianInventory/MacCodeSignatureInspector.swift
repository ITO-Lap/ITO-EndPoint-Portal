import Foundation
import Security

public struct MacCodeSignatureInspector: CodeSignatureInspecting {
    public init() {}

    public func inspect(at applicationURL: URL) -> CodeSignatureInspection {
        var staticCode: SecStaticCode?
        let createStatus = SecStaticCodeCreateWithPath(applicationURL as CFURL, SecCSFlags(), &staticCode)
        guard createStatus == errSecSuccess, let staticCode else {
            return CodeSignatureInspection(status: .unavailable, teamIdentifier: nil)
        }

        var signingInformation: CFDictionary?
        let informationStatus = SecCodeCopySigningInformation(
            staticCode,
            SecCSFlags(rawValue: kSecCSSigningInformation),
            &signingInformation
        )
        if informationStatus == errSecCSUnsigned {
            return CodeSignatureInspection(status: .unsigned, teamIdentifier: nil)
        }
        guard informationStatus == errSecSuccess,
              let signingInformation,
              let information = signingInformation as? [String: Any] else {
            return CodeSignatureInspection(status: .invalid, teamIdentifier: nil)
        }

        let teamIdentifier = information[kSecCodeInfoTeamIdentifier as String] as? String
        let validationStatus = SecStaticCodeCheckValidity(staticCode, SecCSFlags(), nil)
        return CodeSignatureInspection(
            status: validationStatus == errSecSuccess ? .valid : .invalid,
            teamIdentifier: teamIdentifier
        )
    }
}