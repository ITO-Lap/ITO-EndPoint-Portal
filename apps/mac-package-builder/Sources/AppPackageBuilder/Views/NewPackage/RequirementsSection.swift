import SwiftUI

struct RequirementsSection: View {
    @ObservedObject var viewModel: NewPackageViewModel

    var body: some View {
        SectionCard(title: "Requirements") {
            if viewModel.isValidating && viewModel.validation.checks.isEmpty {
                ProgressView("Checking requirements…").controlSize(.small)
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(viewModel.validation.checks) { check in
                        RequirementRow(check: check).padding(.leading, 14)
                    }
                }
            }
        }
    }
}
