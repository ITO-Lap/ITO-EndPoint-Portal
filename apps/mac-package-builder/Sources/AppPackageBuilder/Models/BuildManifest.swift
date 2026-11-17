import Foundation

/// JSON build manifest written alongside every generated package. Captures
/// the four version concepts as distinct fields per spec:
/// application version, homebrew version, package receipt version, and the
/// App Package Builder app version that produced the build.
struct BuildManifest: Codable {
    let applicationName: String
    let homebrewToken: String
    let packageKind: PackageKind
    let applicationVersion: String
    let homebrewVersion: String
    let packageReceiptVersion: String
    let packageIdentifier: String
    let architecture: PackageArchitecture
    let packagingMode: PackagingMode
    let sourceURL: String?
    let sha256Checksum: String?
    let buildDate: Date
    let builderApplicationVersion: String
    let signingIdentity: String?
    let outputFiles: [String]

    static let currentBuilderVersion = "1.0.0"

    init(
        applicationName: String,
        homebrewToken: String,
        packageKind: PackageKind,
        applicationVersion: String,
        homebrewVersion: String,
        packageReceiptVersion: String,
        packageIdentifier: String,
        architecture: PackageArchitecture,
        packagingMode: PackagingMode,
        sourceURL: String?,
        sha256Checksum: String?,
        buildDate: Date,
        builderApplicationVersion: String,
        signingIdentity: String?,
        outputFiles: [String]
    ) {
        self.applicationName = applicationName
        self.homebrewToken = homebrewToken
        self.packageKind = packageKind
        self.applicationVersion = applicationVersion
        self.homebrewVersion = homebrewVersion
        self.packageReceiptVersion = packageReceiptVersion
        self.packageIdentifier = packageIdentifier
        self.architecture = architecture
        self.packagingMode = packagingMode
        self.sourceURL = sourceURL
        self.sha256Checksum = sha256Checksum
        self.buildDate = buildDate
        self.builderApplicationVersion = builderApplicationVersion
        self.signingIdentity = signingIdentity
        self.outputFiles = outputFiles
    }

    private enum CodingKeys: String, CodingKey {
        case applicationName, homebrewToken, packageKind, applicationVersion, homebrewVersion, packageReceiptVersion
        case packageIdentifier, architecture, packagingMode, sourceURL, sha256Checksum, buildDate, builderApplicationVersion
        case signingIdentity, outputFiles
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        applicationName = try container.decode(String.self, forKey: .applicationName)
        homebrewToken = try container.decode(String.self, forKey: .homebrewToken)
        packageKind = try container.decode(PackageKind.self, forKey: .packageKind)
        applicationVersion = try container.decode(String.self, forKey: .applicationVersion)
        homebrewVersion = try container.decode(String.self, forKey: .homebrewVersion)
        packageReceiptVersion = try container.decode(String.self, forKey: .packageReceiptVersion)
        packageIdentifier = try container.decode(String.self, forKey: .packageIdentifier)
        architecture = try container.decode(PackageArchitecture.self, forKey: .architecture)
        packagingMode = try container.decode(PackagingMode.self, forKey: .packagingMode)
        sourceURL = try container.decodeIfPresent(String.self, forKey: .sourceURL)
        sha256Checksum = try container.decodeIfPresent(String.self, forKey: .sha256Checksum)

        if let dateString = try? container.decode(String.self, forKey: .buildDate) {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let parsed = formatter.date(from: dateString) {
                buildDate = parsed
            } else {
                let fallback = ISO8601DateFormatter()
                fallback.formatOptions = [.withInternetDateTime]
                buildDate = fallback.date(from: dateString) ?? Date(timeIntervalSince1970: 0)
            }
        } else if let timestamp = try? container.decode(Double.self, forKey: .buildDate) {
            buildDate = Date(timeIntervalSince1970: timestamp)
        } else {
            buildDate = Date(timeIntervalSince1970: 0)
        }

        builderApplicationVersion = try container.decode(String.self, forKey: .builderApplicationVersion)
        signingIdentity = try container.decodeIfPresent(String.self, forKey: .signingIdentity)
        outputFiles = try container.decode([String].self, forKey: .outputFiles)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(applicationName, forKey: .applicationName)
        try container.encode(homebrewToken, forKey: .homebrewToken)
        try container.encode(packageKind, forKey: .packageKind)
        try container.encode(applicationVersion, forKey: .applicationVersion)
        try container.encode(homebrewVersion, forKey: .homebrewVersion)
        try container.encode(packageReceiptVersion, forKey: .packageReceiptVersion)
        try container.encode(packageIdentifier, forKey: .packageIdentifier)
        try container.encode(architecture, forKey: .architecture)
        try container.encode(packagingMode, forKey: .packagingMode)
        try container.encodeIfPresent(sourceURL, forKey: .sourceURL)
        try container.encodeIfPresent(sha256Checksum, forKey: .sha256Checksum)
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        try container.encode(formatter.string(from: buildDate), forKey: .buildDate)
        try container.encode(builderApplicationVersion, forKey: .builderApplicationVersion)
        try container.encodeIfPresent(signingIdentity, forKey: .signingIdentity)
        try container.encode(outputFiles, forKey: .outputFiles)
    }

    func encodedJSON() throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(self)
    }
}
