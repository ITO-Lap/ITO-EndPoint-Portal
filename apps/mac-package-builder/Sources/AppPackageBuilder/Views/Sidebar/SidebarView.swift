import SwiftUI

enum SidebarSection: String, CaseIterable, Identifiable {
    case overview, newPackage, buildHistory, templates, signing, managedSettings, settings
    case winGetCatalog, newWindowsPackage, windowsBuildJobs, windowsPackageCatalog
    case winTunerPackager, localInstaller

    var id: String { rawValue }

    var title: String {
        switch self {
        case .overview: return "Overview"
        case .newPackage: return "New Package"
        case .buildHistory: return "Build History"
        case .templates: return "Templates"
        case .signing: return "Signing & Notarization"
        case .managedSettings: return "Managed Settings"
        case .settings: return "Settings"
        case .winGetCatalog: return "Create Package"
        case .newWindowsPackage: return "Package Catalog"
        case .windowsBuildJobs: return "Build History"
        case .windowsPackageCatalog: return "Windows Packages"
        case .winTunerPackager: return "WinGet Packager (Local)"
        case .localInstaller: return "Local Installer"
        }
    }

    var subtitle: String {
        switch self {
        case .overview: return "Dashboard & status"
        case .newPackage: return "Create macOS package"
        case .buildHistory: return "View past builds"
        case .templates: return "Reusable configurations"
        case .signing: return "Certificates & options"
        case .managedSettings: return "PPPC, notifications, extensions, profiles"
        case .settings: return "Preferences & integrations"
        case .winGetCatalog: return "Search and create verified packages"
        case .newWindowsPackage: return "Packaged Windows apps & updates"
        case .windowsBuildJobs: return "Completed and failed package builds"
        case .windowsPackageCatalog: return "Windows deployment workspace"
        case .winTunerPackager: return "Package via PowerShell + WinTuner"
        case .localInstaller: return "Browse .msi / .exe → .intunewin"
        }
    }

    var systemImage: String {
        switch self {
        case .overview: return "house.fill"
        case .newPackage: return "plus.circle.fill"
        case .buildHistory: return "clock.fill"
        case .templates: return "doc.on.doc.fill"
        case .signing: return "checkmark.shield.fill"
        case .managedSettings: return "lock.shield.fill"
        case .settings: return "gearshape.fill"
        case .winGetCatalog: return "magnifyingglass"
        case .newWindowsPackage: return "shippingbox.and.arrow.backward.fill"
        case .windowsBuildJobs: return "list.bullet.rectangle.fill"
        case .windowsPackageCatalog: return "square.grid.2x2.fill"
        case .winTunerPackager: return "terminal.fill"
        case .localInstaller: return "doc.badge.gearshape.fill"
        }
    }

    static let packageGroup: [SidebarSection] = [.overview, .newPackage, .buildHistory, .templates, .signing]
    static let deploymentGroup: [SidebarSection] = [.managedSettings]
    static let systemGroup: [SidebarSection] = [.settings]
    static let windowsPackagingGroup: [SidebarSection] = [.winGetCatalog, .newWindowsPackage, .windowsBuildJobs]
    static let winTunerPackagerGroup: [SidebarSection] = [.localInstaller, .winTunerPackager]
}

struct SidebarView: View {
    @Binding var selection: SidebarSection

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(AppTheme.accentGradient)
                    Image(systemName: "shippingbox.fill")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(.white)
                }
                .frame(width: 38, height: 38)
                .shadow(color: AppTheme.accent.opacity(0.35), radius: 6, y: 2)

                VStack(alignment: .leading, spacing: 3) {
                    Text("APP PACKAGE BUILDER")
                        .font(.system(size: 10, weight: .bold, design: .rounded))
                        .foregroundStyle(.secondary)
                    Text("Packaging workspace")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 16)
            .padding(.top, 18)
            .padding(.bottom, 14)

            List(selection: $selection) {
                Section("MAC PACKAGING") {
                    ForEach(SidebarSection.packageGroup) { section in row(for: section) }
                }
                Section("DEPLOYMENT") {
                    ForEach(SidebarSection.deploymentGroup) { section in row(for: section) }
                }
                Section("LOCAL WINGET PACKAGER") {
                    ForEach(SidebarSection.winTunerPackagerGroup) { section in row(for: section) }
                }
                Section("PREFERENCES") {
                    ForEach(SidebarSection.systemGroup) { section in row(for: section) }
                }
            }
            .listStyle(.sidebar)

            Divider()
            HStack(spacing: 10) {
                Circle()
                    .fill(AppTheme.accent.opacity(0.15))
                    .frame(width: 28, height: 28)
                    .overlay {
                        Image(systemName: "checkmark.seal.fill")
                            .font(.system(size: 13))
                            .foregroundStyle(AppTheme.accent)
                    }
                VStack(alignment: .leading, spacing: 1) {
                    Text("App Package Builder")
                        .font(.caption.weight(.semibold))
                    Text("Enterprise packaging tools")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.bar)
        }
        .frame(minWidth: 250)
    }

    @ViewBuilder
    private func row(for section: SidebarSection) -> some View {
        Label {
            VStack(alignment: .leading, spacing: 2) {
                Text(section.title)
                    .font(.system(size: 13, weight: .medium))
                    .lineLimit(1)
                Text(section.subtitle)
                    .font(.system(size: 10.5))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        } icon: {
            Image(systemName: section.systemImage)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(
                    SidebarSection.windowsPackagingGroup.contains(section) ? AppTheme.accent
                        : SidebarSection.winTunerPackagerGroup.contains(section) ? AppTheme.accentSecondary
                        : .secondary
                )
        }
        .tag(section)
        .accessibilityLabel(section.title)
        .accessibilityHint(section.subtitle)
    }
}
