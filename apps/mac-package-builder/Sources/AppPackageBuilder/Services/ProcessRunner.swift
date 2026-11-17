import Foundation

struct ProcessOutput {
    let exitCode: Int32
    let stdout: String
    let stderr: String
}

enum ProcessRunnerError: LocalizedError {
    case executableNotFound(String)
    case cancelled

    var errorDescription: String? {
        switch self {
        case .executableNotFound(let path): return "Executable not found: \(path)"
        case .cancelled: return "The operation was cancelled."
        }
    }
}

/// Abstraction over `Process` so services are testable with a mock and so
/// every call site is forced to pass `executablePath` + `arguments` as an
/// array — never a single interpolated shell string. No call in this app
/// ever runs `/bin/bash -c` with a value built from user/network input.
protocol ProcessRunning {
    @discardableResult
    func run(
        _ executablePath: String,
        arguments: [String],
        currentDirectory: URL?,
        environment: [String: String]?,
        onOutputLine: (@Sendable (String) -> Void)?
    ) async throws -> ProcessOutput
}

final class ProcessRunner: ProcessRunning {

    private final class Box: @unchecked Sendable {
        var process: Process?
    }

    /// Mutable buffer shared between readabilityHandler closures; access is
    /// serialized by `outputLock` in `run`, not by this class itself.
    private final class DataBox: @unchecked Sendable {
        var data = Data()
    }

    /// Tracks in-flight processes so a build can be cancelled cleanly.
    private let activeBox = Box()

    @discardableResult
    func run(
        _ executablePath: String,
        arguments: [String],
        currentDirectory: URL? = nil,
        environment: [String: String]? = nil,
        onOutputLine: (@Sendable (String) -> Void)? = nil
    ) async throws -> ProcessOutput {
        guard FileManager.default.isExecutableFile(atPath: executablePath) else {
            throw ProcessRunnerError.executableNotFound(executablePath)
        }

        let processBox = Box()

        return try await withTaskCancellationHandler(
            operation: {
                try await withCheckedThrowingContinuation { continuation in
                    let process = Process()
                    process.executableURL = URL(fileURLWithPath: executablePath)
                    process.arguments = arguments
                    if let currentDirectory { process.currentDirectoryURL = currentDirectory }
                    if let environment { process.environment = environment }

                    let stdoutPipe = Pipe()
                    let stderrPipe = Pipe()
                    process.standardOutput = stdoutPipe
                    process.standardError = stderrPipe

                    let stdoutBox = DataBox()
                    let stderrBox = DataBox()
                    let outputLock = NSLock()

                    func attach(_ pipe: Pipe, appendTo target: DataBox) {
                        pipe.fileHandleForReading.readabilityHandler = { handle in
                            let chunk = handle.availableData
                            guard !chunk.isEmpty else { return }
                            outputLock.lock()
                            target.data.append(chunk)
                            outputLock.unlock()
                            if let text = String(data: chunk, encoding: .utf8) {
                                for line in text.split(separator: "\n", omittingEmptySubsequences: true) {
                                    onOutputLine?(String(line))
                                }
                            }
                        }
                    }
                    attach(stdoutPipe, appendTo: stdoutBox)
                    attach(stderrPipe, appendTo: stderrBox)

                    process.terminationHandler = { proc in
                        stdoutPipe.fileHandleForReading.readabilityHandler = nil
                        stderrPipe.fileHandleForReading.readabilityHandler = nil
                        outputLock.lock()
                        let out = String(data: stdoutBox.data, encoding: .utf8) ?? ""
                        let err = String(data: stderrBox.data, encoding: .utf8) ?? ""
                        outputLock.unlock()
                        continuation.resume(returning: ProcessOutput(
                            exitCode: proc.terminationStatus,
                            stdout: out,
                            stderr: err
                        ))
                    }

                    self.activeBox.process = process
                    processBox.process = process
                    do {
                        try process.run()
                    } catch {
                        continuation.resume(throwing: error)
                    }
                }
            },
            onCancel: {
                processBox.process?.terminate()
            }
        )
    }

    /// Terminates the currently running child process, if any. Safe to call
    /// even when nothing is running.
    func cancelActive() {
        activeBox.process?.terminate()
    }
}
