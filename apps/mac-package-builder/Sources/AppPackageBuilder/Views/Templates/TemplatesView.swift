import SwiftUI

extension Notification.Name {
    static let applyTemplate = Notification.Name("applyTemplate")
}

struct TemplatesView: View {
    @StateObject private var viewModel = TemplatesViewModel()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                ScreenHeader(title: "Templates", subtitle: "Reusable configurations")

                ForEach(viewModel.templates) { template in
                    HStack {
                        Image(systemName: "doc.on.doc.fill").foregroundStyle(AppTheme.accent)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(template.name).font(.headline)
                            Text(template.summary).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button("Use in New Package") {
                            NotificationCenter.default.post(name: .applyTemplate, object: template)
                        }
                        .buttonStyle(.bordered)
                        if !viewModel.isBuiltIn(template) {
                            Button(role: .destructive) { viewModel.remove(template) } label: {
                                Image(systemName: "trash")
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(14)
                    .cardSurface()
                }
            }
            .padding(24)
        }
        .onAppear { viewModel.reload() }
    }
}
