import Foundation

/// Numeric/semantic-ish version comparison. Homebrew and app versions are not
/// always strict SemVer (e.g. "1.87.2", "16.4_1", "2024.09.17"), so this compares
/// dot/underscore/hyphen separated numeric components left to right, falling back
/// to lexicographic string comparison for non-numeric segments.
struct AppVersionComparator {

    enum Order { case ascending, same, descending }

    static func compare(_ lhs: String, _ rhs: String) -> Order {
        let lhsParts = components(of: lhs)
        let rhsParts = components(of: rhs)
        let count = max(lhsParts.count, rhsParts.count)

        for i in 0..<count {
            let l = i < lhsParts.count ? lhsParts[i] : ""
            let r = i < rhsParts.count ? rhsParts[i] : ""
            if l == r { continue }

            if let ln = Int(l), let rn = Int(r) {
                if ln == rn { continue }
                return ln < rn ? .ascending : .descending
            }
            return l < r ? .ascending : .descending
        }
        return .same
    }

    static func isNewer(_ lhs: String, than rhs: String) -> Bool {
        compare(lhs, rhs) == .descending
    }

    static func isOlder(_ lhs: String, than rhs: String) -> Bool {
        compare(lhs, rhs) == .ascending
    }

    static func isEqual(_ lhs: String, _ rhs: String) -> Bool {
        compare(lhs, rhs) == .same
    }

    private static func components(of version: String) -> [String] {
        version
            .split(whereSeparator: { ".-_".contains($0) })
            .map(String.init)
    }
}
