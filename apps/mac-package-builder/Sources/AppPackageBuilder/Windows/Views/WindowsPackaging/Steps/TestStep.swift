import SwiftUI

/// Step 7: a checkpoint for the administrator to record manual test results.
/// No remote test execution is implied by the brief beyond this checkpoint.
struct TestStep: View {
    @ObservedObject var viewModel: WindowsPackageWizardViewModel

    var body: some View {
        SectionCard(title: "Manual Test Result") {
            VStack(alignment: .leading, spacing: 10) {
                Text("Install and validate the packaged application on a representative test machine, then record the outcome below.")
                    .font(.caption).foregroundStyle(.secondary)
                Picker("Result", selection: $viewModel.testResult) {
                    Text("Not tested").tag(WindowsPackageWizardViewModel.ManualTestResult?.none)
                    ForEach(WindowsPackageWizardViewModel.ManualTestResult.allCases) { result in
                        Text(result.displayName).tag(WindowsPackageWizardViewModel.ManualTestResult?.some(result))
                    }
                }
                .pickerStyle(.segmented)
                TextField("Notes", text: $viewModel.testNotes, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(3...6)
            }
        }
    }
}
