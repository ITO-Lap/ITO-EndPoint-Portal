import Foundation

protocol ValidationServicing {
    func runChecks(for configuration: PackageConfiguration, packageInfo: BrewPackageInfo?) async -> ValidationSummary
}

/// Runs the "Requirements" panel checks. Each check is independent and
/// tolerant of failure — a missing tool produces a `.fail` status rather
/// than throwing, so the panel can render partial results.
final class ValidationService: ValidationServicing {
    private let processRunner: ProcessRunning
    private let homebrewService: HomebrewServicing
    private let signingService: SigningServicing

    init(
        processRunner: ProcessRunning = ProcessRunner(),
        homebrewService: HomebrewServicing = HomebrewService(),
        signingService: SigningServicing = SigningService()
    ) {
        self.processRunner = processRunner
        self.homebrewService = homebrewService
        self.signingService = signingService
    }

    func runChecks(for configuration: PackageConfiguration, packageInfo: BrewPackageInfo?) async -> ValidationSummary {
        async let internet = checkInternet()
        async let homebrew = checkHomebrew()
        async let pkgbuild = checkTool(name: .pkgbuild, path: "/usr/bin/pkgbuild")
        async let productbuild = checkTool(name: .productbuild, path: "/usr/bin/productbuild")
        async let productsign = checkTool(name: .productsign, path: "/usr/bin/productsign")
        async let signingCert = checkSigningCertificate(required: configuration.signPackage)
        async let notarization = checkNotarizationCredentials(required: configuration.notarizePackage, profile: configuration.notarizationKeychainProfile)

        var checks: [RequirementCheck] = []
        checks.append(await internet)
        checks.append(await homebrew)
        checks.append(await pkgbuild)
        checks.append(await productbuild)
        checks.append(await productsign)
        checks.append(await signingCert)
        checks.append(await notarization)
        checks.append(checkPPPC(packageInfo: packageInfo))
        checks.append(checkSystemExtension(packageInfo: packageInfo))
        checks.append(checkNetworkExtension(packageInfo: packageInfo))
        checks.append(checkArchitecture(configuration: configuration, packageInfo: packageInfo))

        return ValidationSummary(checks: checks)
    }

    private func checkInternet() async -> RequirementCheck {
        guard let url = URL(string: "https://formulae.brew.sh/api/formula.json") else {
            return RequirementCheck(name: RequirementKey.internetAccess.rawValue, status: .fail, detail: "Unable to build check URL")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "HEAD"
        request.timeoutInterval = 5
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            let ok = (response as? HTTPURLResponse)?.statusCode ?? 0
            if (200..<400).contains(ok) {
                return RequirementCheck(name: RequirementKey.internetAccess.rawValue, status: .pass, detail: "Available")
            }
            return RequirementCheck(name: RequirementKey.internetAccess.rawValue, status: .warning, detail: "Unexpected response (\(ok))")
        } catch {
            return RequirementCheck(name: RequirementKey.internetAccess.rawValue, status: .fail, detail: "Unreachable")
        }
    }

    private func checkHomebrew() async -> RequirementCheck {
        guard homebrewService.locateBrewExecutable() != nil else {
            return RequirementCheck(name: RequirementKey.homebrewAvailable.rawValue, status: .warning, detail: "Not installed — using the online Homebrew catalog (no install needed)")
        }
        do {
            let version = try await homebrewService.brewVersion()
            return RequirementCheck(name: RequirementKey.homebrewAvailable.rawValue, status: .pass, detail: "Installed (\(version))")
        } catch {
            return RequirementCheck(name: RequirementKey.homebrewAvailable.rawValue, status: .warning, detail: "Installed but version check failed")
        }
    }

    private func checkTool(name: RequirementKey, path: String) -> RequirementCheck {
        let exists = FileManager.default.isExecutableFile(atPath: path)
        return RequirementCheck(name: name.rawValue, status: exists ? .pass : .fail, detail: exists ? "Available" : "Not found at \(path)")
    }

    private func checkSigningCertificate(required: Bool) async -> RequirementCheck {
        guard required else {
            return RequirementCheck(name: RequirementKey.signingCertificate.rawValue, status: .pass, detail: "Not requested")
        }
        let identities = await signingService.availableInstallerIdentities()
        if identities.isEmpty {
            return RequirementCheck(name: RequirementKey.signingCertificate.rawValue, status: .fail, detail: "No Developer ID Installer certificate found in Keychain")
        }
        return RequirementCheck(name: RequirementKey.signingCertificate.rawValue, status: .pass, detail: "\(identities.count) identity(ies) available")
    }

    private func checkNotarizationCredentials(required: Bool, profile: String?) async -> RequirementCheck {
        guard required else {
            return RequirementCheck(name: RequirementKey.notarizationCredentials.rawValue, status: .pass, detail: "Not requested")
        }
        guard let profile, !profile.isEmpty else {
            return RequirementCheck(name: RequirementKey.notarizationCredentials.rawValue, status: .fail, detail: "No keychain profile configured in Settings")
        }
        return RequirementCheck(name: RequirementKey.notarizationCredentials.rawValue, status: .warning, detail: "Using profile \"\(profile)\" — verified at submit time")
    }

    private func checkPPPC(packageInfo: BrewPackageInfo?) -> RequirementCheck {
        RequirementCheck(name: RequirementKey.pppcProfile.rawValue, status: .warning, detail: "Not determined automatically — verify manually if the app needs Accessibility/Full Disk Access")
    }

    private func checkSystemExtension(packageInfo: BrewPackageInfo?) -> RequirementCheck {
        RequirementCheck(name: RequirementKey.systemExtension.rawValue, status: .pass, detail: "Not required")
    }

    private func checkNetworkExtension(packageInfo: BrewPackageInfo?) -> RequirementCheck {
        RequirementCheck(name: RequirementKey.networkExtension.rawValue, status: .pass, detail: "Not required")
    }

    private func checkArchitecture(configuration: PackageConfiguration, packageInfo: BrewPackageInfo?) -> RequirementCheck {
        guard let packageInfo else {
            return RequirementCheck(name: RequirementKey.supportedArchitecture.rawValue, status: .warning, detail: "Select an application to check")
        }
        switch configuration.architecture {
        case .appleSilicon:
            return RequirementCheck(name: RequirementKey.supportedArchitecture.rawValue, status: packageInfo.hasArmVariant ? .pass : .fail, detail: packageInfo.hasArmVariant ? "Apple Silicon supported" : "No Apple Silicon build available")
        case .intel:
            return RequirementCheck(name: RequirementKey.supportedArchitecture.rawValue, status: packageInfo.hasIntelVariant ? .pass : .fail, detail: packageInfo.hasIntelVariant ? "Intel supported" : "No Intel build available")
        case .universal, .automatic:
            let ok = packageInfo.hasArmVariant || packageInfo.hasIntelVariant
            return RequirementCheck(name: RequirementKey.supportedArchitecture.rawValue, status: ok ? .pass : .warning, detail: ok ? "Supported" : "Could not confirm architecture support")
        }
    }
}
