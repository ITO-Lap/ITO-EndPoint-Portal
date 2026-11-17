export type AppDisposition = "approved" | "pending_review" | "blocked";
export type UpdateState = "queued" | "downloading" | "validating" | "installing" | "succeeded" | "failed" | "rolled_back" | "deferred" | "cancelled";
export type RiskLevel = "low" | "medium" | "high" | "critical";

export type ApiApplication = {
  id: string;
  bundleId: string;
  name: string;
  installedVersion: string;
  latestVersion: string | null;
  disposition: AppDisposition;
  risk: RiskLevel;
  sourceName: string | null;
  updateReady: boolean;
};

export type AuditEvent = {
  id: string;
  action: string;
  outcome: "success" | "failure" | "denied" | "info";
  occurredAt: string;
  details: Record<string, unknown>;
};

export type DashboardSummary = {
  secureScore: number;
  appsScanned: number;
  updatesReady: number;
  criticalRisks: number;
  deviceName?: string;
  lastScanAt?: string;
  recentActivity?: AuditEvent[];
};

export type ApiEnvelope<T> = { data: T };

export type InventoryIssue = {
  path: string;
  message: string;
};

export type InstalledApplicationInventory = {
  name: string;
  bundleIdentifier: string;
  shortVersion: string | null;
  bundleVersion: string | null;
  installPath: string;
  installSource: "systemApplications" | "currentUserApplications";
  codeSignature: {
    status: "valid" | "invalid" | "unsigned" | "unavailable";
    teamIdentifier: string | null;
  };
  lastModifiedAt: string | null;
};

export type AgentInventoryReport = {
  serialNumber: string;
  hostname: string;
  currentLoggedInUser: string;
  scannedAt: string;
  applications: InstalledApplicationInventory[];
  issues: InventoryIssue[];
};