import SwiftUI

struct SigningView: View {
    @StateObject private var viewModel = SigningViewModel()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                ScreenHeader(title: "Signing & Notarization", subtitle: "Certificates & options")

                SectionCard(title: "Available Signing Identities") {
                    if viewModel.isLoading {
                        ProgressView().controlSize(.small)
                    } else if viewModel.identities.isEmpty {
                        Text("No \"Developer ID Installer\" certificates found in your Keychain. Import one from Apple Developer to enable package signing.")
                            .font(.caption).foregroundStyle(.secondary)
                    } else {
                        ForEach(viewModel.identities) { identity in
                            HStack {
                                Image(systemName: "checkmark.seal.fill").foregroundStyle(AppTheme.accent)
                                Text(identity.commonName).font(.body)
                                Spacer()
                                Text(identity.sha1.prefix(8) + "…").font(.caption2).foregroundStyle(.secondary)
                            }
                            .padding(.vertical, 2)
                        }
                    }
                    Button("Refresh") { viewModel.reload() }.buttonStyle(.bordered)
                }

                SectionCard(title: "Tooling") {
                    RequirementRow(check: RequirementCheck(name: "pkgbuild", status: viewModel.pkgbuildAvailable ? .pass : .fail, detail: viewModel.pkgbuildAvailable ? "Available" : "Missing"))
                    RequirementRow(check: RequirementCheck(name: "productsign", status: viewModel.productsignAvailable ? .pass : .fail, detail: viewModel.productsignAvailable ? "Available" : "Missing"))
                    RequirementRow(check: RequirementCheck(name: "notarytool", status: viewModel.notarytoolAvailable ? .pass : .fail, detail: viewModel.notarytoolAvailable ? "Available (via xcrun)" : "Missing"))
                }

                SectionCard(title: "Notarization") {
                    Text("App Package Builder never stores your Apple ID password or App Store Connect API key. Store a named profile once, outside this app, then reference it by name here or in Settings:")
                        .font(.caption).foregroundStyle(.secondary)
                    Text("xcrun notarytool store-credentials \"YourProfileName\" --apple-id ak.socl@gmail.com --team-id TEAMID --password app-specific-password")
                        .font(.system(.caption2, design: .monospaced))
                        .padding(8)
                        .background(Color.black)
                        .foregroundStyle(.green)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                        .textSelection(.enabled)
                }
            }
            .padding(24)
        }
        .onAppear { viewModel.reload() }
    }
}
