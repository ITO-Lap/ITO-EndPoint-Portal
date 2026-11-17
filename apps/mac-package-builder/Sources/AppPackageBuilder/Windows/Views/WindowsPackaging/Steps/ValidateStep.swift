import SwiftUI

/// Step 4: renders the `WindowsValidationReport` and blocks moving on unless
/// the hash matches — or an administrator explicitly overrides with a
/// documented reason, mirroring the audit-log expectations in the brief.
struct ValidateStep: View {
    @ObservedObject var viewModel: WindowsPackageWizardViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let report = viewModel.validationReport {
                SectionCard(title: "Validation Report") {
                    VStack(alignment: .leading, spacing: 8) {
                        hashRow("Actual SHA-256", report.actualSHA256)
                        hashRow("Expected SHA-256", report.expectedSHA256 ?? "Not published")
                        HStack {
                            Text("Hash Match").foregroundStyle(.secondary)
                            Spacer()
                            Label(report.hashMatches ? "Match" : "Mismatch", systemImage: report.hashMatches ? "checkmark.circle.fill" : "xmark.octagon.fill")
                                .foregroundStyle(report.hashMatches ? .green : .red)
                        }
                        .font(.callout)
                        infoRow("Authenticode", report.authenticodeStatus.displayName)
                        infoRow("Publisher", report.publisher ?? "Unknown")
                        infoRow("Signing Certificate", report.signingCertificateSubject ?? "—")
                        infoRow("Timestamp", report.timestamp.map(Self.dateFormatter.string(from:)) ?? "—")
                        infoRow("Certificate Expiration", report.certificateExpiration.map(Self.dateFormatter.string(from:)) ?? "—")
                        infoRow("Installer Type", report.installerType.displayName)
                        infoRow("File Version", report.fileVersion ?? "—")
                        infoRow("Product Version", report.productVersion ?? "—")
                        if let code = report.msiProductCode { infoRow("MSI Product Code", code) }
                    }
                }

                if !report.hashMatches {
                    SectionCard(title: "Administrator Override") {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("The computed hash does not match the WinGet manifest. Packaging is blocked unless an administrator explicitly overrides this with a documented reason.")
                                .font(.caption).foregroundStyle(.secondary)
                            TextField("Reason for override (required)", text: $viewModel.adminOverrideReason)
                                .textFieldStyle(.roundedBorder)
                            TextField("Approved by (required)", text: $viewModel.adminOverrideApprover)
                                .textFieldStyle(.roundedBorder)
                            Button("Apply Override", action: viewModel.applyAdminOverride)
                                .disabled(viewModel.adminOverrideReason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                    || viewModel.adminOverrideApprover.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                            if let override = viewModel.validationReport?.adminOverride {
                                Label("Overridden by \(override.approvedBy) on \(Self.dateFormatter.string(from: override.approvedAt)): \(override.reason)", systemImage: "checkmark.seal.fill")
                                    .font(.caption).foregroundStyle(.orange)
                            }
                        }
                    }
                }
            } else {
                RemoteJobPhaseView(phase: viewModel.validationPhase, emptyText: "Complete the download step first.")
            }
        }
    }

    private func hashRow(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.system(.caption, design: .monospaced)).textSelection(.enabled)
        }
    }

    private func infoRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(.secondary)
            Spacer()
            Text(value)
        }
        .font(.callout)
    }

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .short
        return f
    }()
}
