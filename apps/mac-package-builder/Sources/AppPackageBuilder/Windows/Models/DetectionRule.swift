import Foundation

/// A detection rule tree, rendered by a later `WindowsDetectionGeneratorService`
/// into Endpoint Central / Intune compatible detection script text. Modeled as
/// an `indirect enum` so `combined` can nest arbitrarily deep AND/OR trees
/// without a separate reference type.
indirect enum DetectionRule: Codable, Equatable {
    case msiProductCode(String)
    case registryValue(path: String, valueName: String, expected: String)
    case fileExists(path: String)
    case fileVersion(path: String, comparator: Comparator, version: String)
    case powerShellCustom(script: String)
    case combined(operator: LogicalOperator, rules: [DetectionRule])

    /// Comparison used when checking a file's version against `version`.
    enum Comparator: String, Codable, CaseIterable, Identifiable {
        case equals
        case greaterThanOrEqual
        case greaterThan
        case lessThanOrEqual
        case lessThan

        var id: String { rawValue }
    }

    /// How child rules combine inside a `combined` node.
    enum LogicalOperator: String, Codable, CaseIterable, Identifiable {
        case and
        case or

        var id: String { rawValue }
    }
}
