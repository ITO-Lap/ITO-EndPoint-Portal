import SwiftUI

/// The Package phase: live stdout/stderr from the running script, a Cancel
/// button, and no fabricated progress — only real output lines, mirroring
/// `BuildConsoleView`'s style from the macOS Homebrew flow.
struct PackagePhaseView: View {
    @ObservedObject var viewModel: WinTunerConfigurationViewModel

    var body: some View {
        SectionCard(title: "Packaging in Progress") {
            HStack {
                if viewModel.isRunning {
                    ProgressView().controlSize(.small)
                    Text("Running WinTuner package…").font(.subheadline)
                } else if let runError = viewModel.runError {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(.red)
                    Text(runError).font(.subheadline).foregroundStyle(.red)
                }
                Spacer()
            }

            ScrollView {
                ScrollViewReader { proxy in
                    VStack(alignment: .leading, spacing: 2) {
                        ForEach(Array(viewModel.liveLogLines.enumerated()), id: \.offset) { index, line in
                            Text(line)
                                .font(.system(.caption, design: .monospaced))
                                .foregroundStyle(.green)
                                .id(index)
                                .textSelection(.enabled)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .onChange(of: viewModel.liveLogLines.count) { _, _ in
                        if let last = viewModel.liveLogLines.indices.last {
                            proxy.scrollTo(last, anchor: .bottom)
                        }
                    }
                }
                .padding(8)
            }
            .frame(height: 260)
            .background(Color.black)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .accessibilityLabel("Packaging console output")

            HStack {
                Button("Cancel", role: .destructive) { viewModel.cancelPackaging() }
                    .disabled(!viewModel.isRunning)
                if !viewModel.isRunning && viewModel.runError != nil {
                    Button("Retry") { viewModel.retryCurrentPhase() }
                    Button("Back to Review") { viewModel.phase = .review }
                        .buttonStyle(.plain)
                        .font(.caption)
                }
            }
            .padding(.top, 4)
        }
        // Navigating away mid-run is disabled at the phase-indicator level
        // (there is no back/forward control rendered while `.packaging` is
        // active other than this view's own Cancel/Retry/Back-to-Review).
    }
}
