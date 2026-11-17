export type AppRecord = {
  id: string;
  name: string;
  bundleId: string;
  installedVersion: string;
  latestVersion: string | null;
  owner: "Managed" | "Review" | "Blocked";
  risk: "Low" | "Medium" | "High" | "Critical";
  source: string | null;
  updateReady: boolean;
};