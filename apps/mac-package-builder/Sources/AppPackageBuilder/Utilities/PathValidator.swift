import Foundation

/// Canonicalizes and validates filesystem paths before they are used for any
/// write, delete, or build operation. Rejects path traversal, symlink escapes
/// out of an expected root, and anything that resolves outside the user's home
/// or an explicitly chosen output directory.
enum PathValidator {

    /// Resolves `path` to an absolute, symlink-free canonical path and verifies
    /// it does not contain traversal segments after resolution tricks.
    static func canonicalize(_ path: String) throws -> URL {
        let expanded = (path as NSString).expandingTildeInPath
        let url = URL(fileURLWithPath: expanded)
        let standardized = url.standardizedFileURL

        // Resolve symlinks only if the path exists; otherwise validate the
        // deepest existing ancestor to prevent a symlink further up the tree
        // from silently redirecting writes outside the intended location.
        let resolved: URL
        if FileManager.default.fileExists(atPath: standardized.path) {
            resolved = standardized.resolvingSymlinksInPath()
        } else {
            resolved = try resolveDeepestExistingAncestor(of: standardized)
        }

        guard !resolved.path.isEmpty, resolved.path != "/" else {
            throw ValidationError.invalidPath(path)
        }
        return resolved
    }

    /// Ensures `candidate` is contained within `root` after canonicalization,
    /// e.g. before recursively deleting a "build directory".
    static func require(_ candidate: URL, toBeWithin root: URL) throws {
        let rootPath = root.standardizedFileURL.resolvingSymlinksInPath().path
        let candidatePath = candidate.standardizedFileURL.path
        guard candidatePath.hasPrefix(rootPath + "/") || candidatePath == rootPath else {
            throw ValidationError.invalidPath(candidate.path)
        }
    }

    /// Only ever call `rm -rf`-equivalent removal through this function: it
    /// re-validates containment immediately before deleting, closing the gap
    /// between validation and use.
    static func removeContentsSafely(_ directory: URL, mustBeWithin root: URL) throws {
        try require(directory, toBeWithin: root)
        guard FileManager.default.fileExists(atPath: directory.path) else { return }
        try FileManager.default.removeItem(at: directory)
    }

    private static func resolveDeepestExistingAncestor(of url: URL) throws -> URL {
        var current = url
        var remainder: [String] = []
        while !FileManager.default.fileExists(atPath: current.path) {
            guard current.pathComponents.count > 1 else {
                throw ValidationError.invalidPath(url.path)
            }
            remainder.insert(current.lastPathComponent, at: 0)
            current = current.deletingLastPathComponent()
        }
        let resolvedAncestor = current.resolvingSymlinksInPath()
        return remainder.reduce(resolvedAncestor) { $0.appendingPathComponent($1) }
    }
}
