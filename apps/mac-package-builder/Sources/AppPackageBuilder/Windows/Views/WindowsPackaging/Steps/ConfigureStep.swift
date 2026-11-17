import SwiftUI

/// Step 5: administrator-editable `WindowsPackageConfiguration` form,
/// pre-filled with AI-suggested starting values by
/// `WindowsPackageWizardViewModel.seedSuggestedConfiguration()`. Includes a
/// minimal `DetectionRule` builder covering fileExists / fileVersion /
/// msiProductCode / combined, plus simple registryValue / powerShellCustom
/// fields.
struct ConfigureStep: View {
    @ObservedObject var viewModel: WindowsPackageWizardViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionCard(title: "Install / Uninstall") {
                VStack(alignment: .leading, spacing: 8) {
                    labeledField("Install Command", $viewModel.configuration.installCommand)
                    labeledField("Uninstall Command", $viewModel.configuration.uninstallCommand)
                    Picker("Context", selection: $viewModel.configuration.installContext) {
                        ForEach(WindowsPackageConfiguration.InstallContext.allCases) { c in
                            Text(c.displayName).tag(c)
                        }
                    }
                    Picker("Restart Behavior", selection: $viewModel.configuration.restartBehavior) {
                        ForEach(WindowsPackageConfiguration.RestartBehavior.allCases) { b in
                            Text(b.displayName).tag(b)
                        }
                    }
                    Picker("Architecture", selection: $viewModel.configuration.architecture) {
                        ForEach(WinGetPackageDetail.Architecture.allCases) { a in
                            Text(a.displayName).tag(a)
                        }
                    }
                    labeledField("Minimum Windows Version", $viewModel.configuration.minimumWindowsVersion)
                }
            }

            SectionCard(title: "Return Codes") {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(viewModel.configuration.returnCodes.sorted(by: { $0.key < $1.key }), id: \.key) { code, meaning in
                        HStack {
                            Text("\(code)").font(.system(.callout, design: .monospaced)).frame(width: 60, alignment: .leading)
                            Text(meaning).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }

            SectionCard(title: "Requirements & Dependencies") {
                VStack(alignment: .leading, spacing: 8) {
                    listEditor("Requirements", items: $viewModel.configuration.requirements)
                    listEditor("Dependencies", items: $viewModel.configuration.dependencies)
                    listEditor("Supersedes", items: $viewModel.configuration.supersedes)
                }
            }

            DetectionRuleBuilderSection(rules: $viewModel.configuration.detectionRules)
        }
    }

    private func labeledField(_ label: String, _ text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            TextField(label, text: text).textFieldStyle(.roundedBorder)
        }
    }

    private func listEditor(_ label: String, items: Binding<[String]>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            ForEach(items.wrappedValue.indices, id: \.self) { index in
                HStack {
                    TextField("Value", text: Binding(
                        get: { items.wrappedValue[index] },
                        set: { items.wrappedValue[index] = $0 }
                    ))
                    .textFieldStyle(.roundedBorder)
                    Button(role: .destructive) {
                        items.wrappedValue.remove(at: index)
                    } label: {
                        Image(systemName: "minus.circle.fill")
                    }
                    .buttonStyle(.plain)
                }
            }
            Button("Add \(label.dropLast())") { items.wrappedValue.append("") }
                .controlSize(.small)
        }
    }
}

/// Minimal builder for a flat or one-level-combined `DetectionRule` tree.
/// Supports the brief's minimum bar (fileExists, fileVersion,
/// msiProductCode, combined) plus simple registryValue / powerShellCustom
/// forms.
private struct DetectionRuleBuilderSection: View {
    @Binding var rules: [DetectionRule]

    var body: some View {
        SectionCard(title: "Detection Rules") {
            VStack(alignment: .leading, spacing: 10) {
                if rules.isEmpty {
                    Text("No detection rules configured.").font(.caption).foregroundStyle(.secondary)
                }
                ForEach(rules.indices, id: \.self) { index in
                    DetectionRuleRow(rule: $rules[index], onDelete: { rules.remove(at: index) })
                }
                Menu("Add Rule") {
                    Button("File Exists") { rules.append(.fileExists(path: "")) }
                    Button("File Version") { rules.append(.fileVersion(path: "", comparator: .greaterThanOrEqual, version: "")) }
                    Button("MSI Product Code") { rules.append(.msiProductCode("")) }
                    Button("Registry Value") { rules.append(.registryValue(path: "", valueName: "", expected: "")) }
                    Button("PowerShell Custom") { rules.append(.powerShellCustom(script: "")) }
                    Button("Combined (AND/OR)") { rules.append(.combined(operator: .and, rules: [])) }
                }
                .controlSize(.small)
            }
        }
    }
}

/// One editable row for a `DetectionRule`. `combined` rules recursively
/// nest their children using the same row type.
private struct DetectionRuleRow: View {
    @Binding var rule: DetectionRule
    var onDelete: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(kindLabel).font(.caption).bold()
                Spacer()
                Button(role: .destructive, action: onDelete) {
                    Image(systemName: "trash")
                }
                .buttonStyle(.plain)
            }
            fields
        }
        .padding(8)
        .background(.background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var kindLabel: String {
        switch rule {
        case .fileExists: return "File Exists"
        case .fileVersion: return "File Version"
        case .msiProductCode: return "MSI Product Code"
        case .registryValue: return "Registry Value"
        case .powerShellCustom: return "PowerShell Custom"
        case .combined(let op, _): return "Combined (\(op.rawValue.uppercased()))"
        }
    }

    @ViewBuilder
    private var fields: some View {
        switch rule {
        case .fileExists(let path):
            TextField("Path", text: Binding(get: { path }, set: { rule = .fileExists(path: $0) }))
                .textFieldStyle(.roundedBorder)

        case .fileVersion(let path, let comparator, let version):
            TextField("Path", text: Binding(get: { path }, set: { rule = .fileVersion(path: $0, comparator: comparator, version: version) }))
                .textFieldStyle(.roundedBorder)
            Picker("Comparator", selection: Binding(get: { comparator }, set: { rule = .fileVersion(path: path, comparator: $0, version: version) })) {
                ForEach(DetectionRule.Comparator.allCases) { c in Text(c.rawValue).tag(c) }
            }
            TextField("Version", text: Binding(get: { version }, set: { rule = .fileVersion(path: path, comparator: comparator, version: $0) }))
                .textFieldStyle(.roundedBorder)

        case .msiProductCode(let code):
            TextField("Product Code", text: Binding(get: { code }, set: { rule = .msiProductCode($0) }))
                .textFieldStyle(.roundedBorder)

        case .registryValue(let path, let valueName, let expected):
            TextField("Registry Path", text: Binding(get: { path }, set: { rule = .registryValue(path: $0, valueName: valueName, expected: expected) }))
                .textFieldStyle(.roundedBorder)
            TextField("Value Name", text: Binding(get: { valueName }, set: { rule = .registryValue(path: path, valueName: $0, expected: expected) }))
                .textFieldStyle(.roundedBorder)
            TextField("Expected Value", text: Binding(get: { expected }, set: { rule = .registryValue(path: path, valueName: valueName, expected: $0) }))
                .textFieldStyle(.roundedBorder)

        case .powerShellCustom(let script):
            TextEditor(text: Binding(get: { script }, set: { rule = .powerShellCustom(script: $0) }))
                .frame(minHeight: 60)
                .font(.system(.caption, design: .monospaced))
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.secondary.opacity(0.3)))

        case .combined(let op, let children):
            Picker("Operator", selection: Binding(get: { op }, set: { rule = .combined(operator: $0, rules: children) })) {
                ForEach(DetectionRule.LogicalOperator.allCases) { o in Text(o.rawValue.uppercased()).tag(o) }
            }
            ForEach(children.indices, id: \.self) { index in
                DetectionRuleRow(
                    rule: Binding(
                        get: { children[index] },
                        set: { newValue in
                            var updated = children
                            updated[index] = newValue
                            rule = .combined(operator: op, rules: updated)
                        }
                    ),
                    onDelete: {
                        var updated = children
                        updated.remove(at: index)
                        rule = .combined(operator: op, rules: updated)
                    }
                )
            }
            Menu("Add Child Rule") {
                Button("File Exists") { rule = .combined(operator: op, rules: children + [.fileExists(path: "")]) }
                Button("MSI Product Code") { rule = .combined(operator: op, rules: children + [.msiProductCode("")]) }
            }
            .controlSize(.mini)
        }
    }
}
