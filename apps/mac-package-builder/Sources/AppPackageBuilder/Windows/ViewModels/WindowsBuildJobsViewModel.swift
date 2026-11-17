import Foundation

/// Drives the Windows Build Jobs list — polls job status and supports
/// cancellation. Jobs are tracked client-side (submitted from the wizard);
/// this ViewModel refreshes each tracked job's phase from the agent.
@MainActor
final class WindowsBuildJobsViewModel: ObservableObject {
    @Published var jobs: [WindowsBuildJob] = []
    @Published var phase: RemoteJobPhase = .empty

    private let client: RemoteBuildAgentServicing

    /// `client` overrides everything (tests/previews). Otherwise resolved
    /// from `connectionStore`: real `WindowsBuildAgentClient` when a Windows
    /// Build Agent is configured, `DemoBuildAgentClient()` otherwise.
    init(connectionStore: WindowsAgentConnectionStore? = nil, client: RemoteBuildAgentServicing? = nil) {
        self.client = client ?? (connectionStore ?? WindowsAgentConnectionStore()).makeClient()
    }

    func track(_ job: WindowsBuildJob) {
        if let index = jobs.firstIndex(where: { $0.id == job.id }) {
            jobs[index] = job
        } else {
            jobs.insert(job, at: 0)
        }
        phase = .idle
    }

    func refresh() {
        guard !jobs.isEmpty else {
            phase = .empty
            return
        }
        phase = .loading
        Task {
            var updated: [WindowsBuildJob] = []
            for job in jobs {
                if let latest = try? await client.jobStatus(id: job.id) {
                    updated.append(latest)
                } else {
                    updated.append(job)
                }
            }
            jobs = updated
            phase = .idle
        }
    }

    func cancel(_ job: WindowsBuildJob) {
        Task {
            do {
                try await client.cancelJob(id: job.id)
                if let index = jobs.firstIndex(where: { $0.id == job.id }) {
                    jobs[index].phase = .cancelled
                    jobs[index].updatedAt = Date()
                }
            } catch {
                phase = .error(error.localizedDescription)
            }
        }
    }
}
