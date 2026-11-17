import SwiftUI

struct BuildHistoryView: View {
    @StateObject private var viewModel = BuildHistoryViewModel()
    @State private var recordPendingFileDeletion: BuildHistoryRecord?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            ScreenHeader(title: "Build History", subtitle: "View past builds")
                .padding([.horizontal, .top], 24)

            if viewModel.records.isEmpty {
                Spacer()
                Text("No builds yet.").foregroundStyle(.secondary)
                Spacer()
            } else {
                List {
                    ForEach(viewModel.records) { record in
                        row(for: record)
                    }
                }
                .listStyle(.inset)
            }
        }
        .onAppear { viewModel.reload() }
        .confirmationDialog(
            "Also delete the generated package files?",
            isPresented: Binding(get: { recordPendingFileDeletion != nil }, set: { if !$0 { recordPendingFileDeletion = nil } })
        ) {
            Button("Delete Record Only", role: .destructive) {
                if let record = recordPendingFileDeletion { viewModel.removeRecordOnly(record) }
                recordPendingFileDeletion = nil
            }
            Button("Delete Record and Files", role: .destructive) {
                if let record = recordPendingFileDeletion { viewModel.removeRecordAndFiles(record) }
                recordPendingFileDeletion = nil
            }
            Button("Cancel", role: .cancel) { recordPendingFileDeletion = nil }
        }
    }

    private func row(for record: BuildHistoryRecord) -> some View {
        HStack {
            Image(systemName: iconName(for: record.result))
                .foregroundStyle(color(for: record.result))
            VStack(alignment: .leading, spacing: 2) {
                Text("\(record.applicationName) — \(record.version)").font(.body)
                Text("\(record.buildDate.formatted(date: .abbreviated, time: .shortened)) · \(record.packagingMode.displayName) · \(String(format: "%.1fs", record.durationSeconds))")
                    .font(.caption2).foregroundStyle(.secondary)
                Text(record.outputPath).font(.caption2).foregroundStyle(.tertiary).lineLimit(1).truncationMode(.middle)
            }
            Spacer()
            if record.isSigned {
                Image(systemName: "checkmark.seal.fill").foregroundStyle(.blue).help("Signed")
            }
            Menu {
                Button("Reveal Output") { viewModel.reveal(record) }
                Button("Duplicate Configuration") { }
                Button("Rebuild") { }
                Divider()
                Button("Remove Record…", role: .destructive) { recordPendingFileDeletion = record }
            } label: {
                Image(systemName: "ellipsis.circle")
            }
            .menuStyle(.borderlessButton)
            .frame(width: 24)
        }
        .padding(.vertical, 4)
    }

    private func iconName(for result: BuildResult) -> String {
        switch result {
        case .success: return "checkmark.circle.fill"
        case .failed: return "xmark.circle.fill"
        case .cancelled: return "minus.circle.fill"
        }
    }

    private func color(for result: BuildResult) -> Color {
        switch result {
        case .success: return .green
        case .failed: return .red
        case .cancelled: return .orange
        }
    }
}
