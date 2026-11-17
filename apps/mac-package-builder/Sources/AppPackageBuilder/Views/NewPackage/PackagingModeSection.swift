import SwiftUI

struct PackagingModeSection: View {
    @ObservedObject var viewModel: NewPackageViewModel

    var body: some View {
        SectionCard(title: "3. Packaging Mode") {
            HStack(spacing: 12) {
                modeCard(.enterprisePayload, icon: "shippingbox.fill")
                modeCard(.onlineInstaller, icon: "cloud.fill")
            }
        }
    }

    private func modeCard(_ mode: PackagingMode, icon: String) -> some View {
        let isSelected = viewModel.configuration.packagingMode == mode
        return Button {
            viewModel.configuration.packagingMode = mode
            Task { await viewModel.runValidation() }
        } label: {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: icon)
                    .font(.title2)
                    .foregroundStyle(isSelected ? .white : .secondary)
                    .frame(width: 32, height: 32)
                    .background(isSelected ? Color.blue : Color.gray.opacity(0.15))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                VStack(alignment: .leading, spacing: 3) {
                    Text(mode.displayName).font(.subheadline).bold()
                    Text(mode.explanation).font(.caption2).foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(isSelected ? Color.blue.opacity(0.08) : Color.clear)
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(isSelected ? Color.blue : Color.secondary.opacity(0.3), lineWidth: isSelected ? 2 : 1))
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(mode.displayName)
        .accessibilityHint(mode.explanation)
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }
}
