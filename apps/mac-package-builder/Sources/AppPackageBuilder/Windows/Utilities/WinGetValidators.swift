import Foundation

/// Input validators for values that will be sent to the Windows Build Agent
/// and, on that agent, embedded in a `winget`/PowerShell invocation or a
/// filesystem path. Mirrors `Validators.swift`'s pattern exactly. Transport
/// here is JSON, not a shell string, but the agent still shells out on the
/// far end — rejecting malformed input on the Mac side is defense in depth,
/// not the only line of defense (the agent independently re-validates;
/// never trust the client).
enum WinGetValidationError: LocalizedError, Equatable {
    case invalidPackageId(String)
    case invalidVersion(String)
    case invalidWindowsPath(String)

    var errorDescription: String? {
        switch self {
        case .invalidPackageId(let v):
            return "\"\(v)\" is not a valid WinGet package ID."
        case .invalidVersion(let v):
            return "\"\(v)\" is not a valid version string."
        case .invalidWindowsPath(let v):
            return "\"\(v)\" is not a valid, safe Windows-relative path."
        }
    }
}

enum WinGetValidators {

    /// WinGet package IDs are dotted `Publisher.Package[.Suffix]`, e.g.
    /// "Microsoft.VisualStudioCode" or "Git.Git.MinGit".
    private static let packageIdPattern = #"^[A-Za-z0-9][A-Za-z0-9-]*(\.[A-Za-z0-9][A-Za-z0-9-]*)+$"#

    /// Loose semver-ish version: digits/letters separated by `.`, `-`, `_`,
    /// `+`, allowing a trailing non-numeric build tag (e.g. "1.2.3-beta.1").
    private static let versionPattern = #"^[0-9]+(\.[0-9]+){0,3}([._+-][A-Za-z0-9]+)*$"#

    /// Reserved DOS device names, checked case-insensitively against each
    /// path segment (with or without an extension, e.g. "con" and "con.txt"
    /// both refer to the reserved device).
    private static let reservedDeviceNames: Set<String> = [
        "con", "prn", "aux", "nul",
        "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
        "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
    ]

    static func isValidPackageId(_ id: String) -> Bool {
        matches(id, pattern: packageIdPattern) && id.count <= 255
    }

    static func validatePackageId(_ id: String) throws -> String {
        guard isValidPackageId(id) else { throw WinGetValidationError.invalidPackageId(id) }
        return id
    }

    static func isValidVersion(_ version: String) -> Bool {
        matches(version, pattern: versionPattern) && version.count <= 64
    }

    static func validateVersion(_ version: String) throws -> String {
        guard isValidVersion(version) else { throw WinGetValidationError.invalidVersion(version) }
        return version
    }

    /// Rejects `..` traversal segments, a leading UNC (`\\server\share`)
    /// prefix, an absolute drive letter (`C:\...`), and reserved DOS device
    /// names — before this Mac app ever sends the path to the remote agent.
    static func isValidWindowsRelativePath(_ path: String) -> Bool {
        guard !path.isEmpty else { return false }
        if path.hasPrefix(#"\\"#) || path.hasPrefix("//") {
            return false
        }
        if matches(path, pattern: #"^[A-Za-z]:"#) {
            return false
        }
        let segments = path
            .split(whereSeparator: { $0 == "\\" || $0 == "/" })
            .map(String.init)
        for segment in segments {
            if segment == ".." || segment == "." {
                return false
            }
            let nameWithoutExtension = segment.split(separator: ".").first.map(String.init) ?? segment
            if reservedDeviceNames.contains(nameWithoutExtension.lowercased()) {
                return false
            }
        }
        return true
    }

    static func validateWindowsRelativePath(_ path: String) throws -> String {
        guard isValidWindowsRelativePath(path) else {
            throw WinGetValidationError.invalidWindowsPath(path)
        }
        return path
    }

    private static func matches(_ value: String, pattern: String) -> Bool {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return false }
        let range = NSRange(value.startIndex..<value.endIndex, in: value)
        return regex.firstMatch(in: value, range: range) != nil
    }
}
