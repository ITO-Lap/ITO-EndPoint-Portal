import SwiftUI

struct NewWindowsPackageView: View {
    @StateObject private var viewModel = WindowsPackageWizardViewModel()

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("New Windows Package").font(.title2).bold()
            stepIndicator

            ScrollView {
                stepContainer
                    .padding(.vertical, 8)
            }

            Divider()
            HStack {
                Button("Back", action: viewModel.goBack)
                    .disabled(viewModel.currentStep == .selectApplication)
                Spacer()
                Text(viewModel.currentStep.title).font(.caption).foregroundStyle(.secondary)
                Spacer()
                Button("Next", action: viewModel.goNext)
                    .buttonStyle(.borderedProminent)
                    .disabled(viewModel.currentStep == .export || !viewModel.canAdvance(from: viewModel.currentStep))
            }
        }
        .padding(20)
    }

    private var stepIndicator: some View {
        HStack(spacing: 4) {
            ForEach(WindowsPackageWizardStep.allCases) { step in
                VStack(spacing: 4) {
                    ZStack {
                        Circle()
                            .fill(step == viewModel.currentStep ? Color.accentColor : Color.secondary.opacity(0.2))
                            .frame(width: 24, height: 24)
                        Text("\(step.rawValue + 1)")
                            .font(.caption2).bold()
                            .foregroundStyle(step == viewModel.currentStep ? .white : .secondary)
                    }
                    Text(step.title)
                        .font(.caption2)
                        .foregroundStyle(step == viewModel.currentStep ? .primary : .secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                if step != WindowsPackageWizardStep.allCases.last {
                    Rectangle()
                        .fill(Color.secondary.opacity(0.2))
                        .frame(height: 1)
                        .frame(maxWidth: .infinity)
                        .padding(.bottom, 16)
                }
            }
        }
    }

    @ViewBuilder
    private var stepContainer: some View {
        switch viewModel.currentStep {
        case .selectApplication: SelectApplicationStep(viewModel: viewModel)
        case .selectVersion: SelectVersionStep(viewModel: viewModel)
        case .download: DownloadStep(viewModel: viewModel)
        case .validate: ValidateStep(viewModel: viewModel)
        case .configure: ConfigureStep(viewModel: viewModel)
        case .package: PackageStep(viewModel: viewModel)
        case .test: TestStep(viewModel: viewModel)
        case .export: ExportStep(viewModel: viewModel)
        }
    }
}
