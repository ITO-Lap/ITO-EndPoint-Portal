import SwiftUI
import AppKit

struct BuildConsoleView: View {
    @ObservedObject var logService: BuildLogService

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Build Console").font(.headline)
                Spacer()
                Button("Clear") { logService.clear() }
                    .buttonStyle(.plain).font(.caption)
                Button {
                    let pasteboard = NSPasteboard.general
                    pasteboard.clearContents()
                    pasteboard.setString(logService.fullTranscript, forType: .string)
                } label: {
                    Text("Copy")
                }
                .buttonStyle(.plain).font(.caption)
                Button("Export Log…") { exportLog() }
                    .buttonStyle(.plain).font(.caption)
            }

            ScrollView {
                ScrollViewReader { proxy in
                    VStack(alignment: .leading, spacing: 2) {
                        ForEach(logService.lines) { line in
                            Text(line.formatted)
                                .font(.system(.caption, design: .monospaced))
                                .foregroundStyle(.green)
                                .id(line.id)
                                .textSelection(.enabled)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .onChange(of: logService.lines.count) { _, _ in
                        if let last = logService.lines.last {
                            proxy.scrollTo(last.id, anchor: .bottom)
                        }
                    }
                }
                .padding(8)
            }
            .frame(height: 220)
            .background(Color.black)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .accessibilityLabel("Build console output")

            Button("Reveal Output in Finder") { revealOutput() }
                .buttonStyle(.plain)
                .font(.caption)
        }
        .padding(16)
        .background(.background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func exportLog() {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = "build-log.txt"
        if panel.runModal() == .OK, let url = panel.url {
            try? logService.export(to: url)
        }
    }

    private func revealOutput() {
        guard let line = logService.lines.last(where: { $0.text.contains("Build complete:") }) else { return }
        let path = line.text.replacingOccurrences(of: "Build complete: ", with: "")
        NSWorkspace.shared.selectFile(path, inFileViewerRootedAtPath: "")
    }
}
