import SwiftUI

extension Notification.Name {
    /// Posted by `AgentDisconnectedBanner` (and anywhere else in the Windows
    /// Packaging module) to ask `RootView` to present the Agent Connection
    /// screen, mirroring `TemplatesView`'s `.applyTemplate` cross-view
    /// navigation precedent — the banner has no reference to the sidebar
    /// selection state, so it asks via notification instead.
    static let showAgentConnection = Notification.Name("showAgentConnection")
}

/// Shown wherever a Windows Packaging screen cannot proceed without a
/// reachable, ready Windows Build Agent. Copy is fixed per the product brief.
struct AgentDisconnectedBanner: View {
    /// Defaults to posting `.showAgentConnection`; a caller that already owns
    /// its own navigation (e.g. a sheet presenter) can override this instead.
    var onConnectTapped: () -> Void = {
        NotificationCenter.default.post(name: .showAgentConnection, object: nil)
    }

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "bolt.horizontal.circle")
                .font(.system(size: 32))
                .foregroundStyle(.orange)
            Text("A Windows Build Agent is required for WinGet downloads and Windows package creation.")
                .font(.callout)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Button("Go to Agent Connection", action: onConnectTapped)
                .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity)
        .padding(24)
        .background(Color.orange.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
