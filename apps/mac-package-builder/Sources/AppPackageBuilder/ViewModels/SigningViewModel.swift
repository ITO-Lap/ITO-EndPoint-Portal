import Foundation

@MainActor
final class SigningViewModel: ObservableObject {
    @Published var identities: [SigningIdentity] = []
    @Published var isLoading = false
    @Published var pkgbuildAvailable = false
    @Published var productsignAvailable = false
    @Published var notarytoolAvailable = false

    private let signingService: SigningServicing

    init(signingService: SigningServicing = SigningService()) {
        self.signingService = signingService
        pkgbuildAvailable = FileManager.default.isExecutableFile(atPath: "/usr/bin/pkgbuild")
        productsignAvailable = FileManager.default.isExecutableFile(atPath: "/usr/bin/productsign")
        notarytoolAvailable = FileManager.default.isExecutableFile(atPath: "/usr/bin/xcrun")
    }

    func reload() {
        isLoading = true
        Task {
            let found = await signingService.availableInstallerIdentities()
            await MainActor.run {
                self.identities = found
                self.isLoading = false
            }
        }
    }
}
