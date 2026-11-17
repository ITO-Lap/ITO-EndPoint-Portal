import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Laptop,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import type { AppRecord } from "./data";

export type WorkspacePageName = "Devices" | "Discovered Apps" | "Updates" | "Automation" | "Policies" | "AI Update Assistant" | "Activity" | "Settings";

type WorkspaceViewsProps = {
  page: WorkspacePageName;
  apps: AppRecord[];
  liveError: string;
  apiBaseURL: string;
  onSaveApiBaseURL: (url: string) => void;
};

type APIRecord = Record<string, unknown>;

const resourcePaths: Partial<Record<WorkspacePageName, string>> = {
  Devices: "/devices",
  Updates: "/updates",
  Activity: "/audit-events",
};

export function WorkspaceViews({ page, apps, liveError, apiBaseURL, onSaveApiBaseURL }: WorkspaceViewsProps) {
  const [records, setRecords] = useState<APIRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const resourcePath = resourcePaths[page];

  useEffect(() => {
    if (page === "Settings" || !resourcePath) {
      setRecords([]);
      setRequestError("");
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    let firstLoad = true;
    let inFlight = false;
    setRecords([]);
    setRequestError("");
    setIsLoading(true);
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch(`${apiBaseURL.replace(/\/$/, "")}${resourcePath}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`${page} API responded with HTTP ${response.status}.`);
        const payload = (await response.json()) as { data?: unknown };
        if (!Array.isArray(payload.data)) throw new Error(`${page} API returned an invalid data collection.`);
        if (active) {
          setRecords(payload.data.filter((record): record is APIRecord => typeof record === "object" && record !== null));
          setRequestError("");
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (active) {
          setRecords([]);
          setRequestError(error instanceof Error ? error.message : `Unable to load ${page.toLowerCase()}.`);
        }
      } finally {
        inFlight = false;
        if (active && firstLoad) {
          firstLoad = false;
          setIsLoading(false);
        }
      }
    };

    void refresh();
    const intervalId = window.setInterval(() => void refresh(), 30_000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      controller.abort();
    };
  }, [apiBaseURL, liveError, page, refreshKey, resourcePath]);

  if (page === "Settings") return <SettingsView apiBaseURL={apiBaseURL} onSaveApiBaseURL={onSaveApiBaseURL} />;
  if (page === "Discovered Apps") {
    return <ApplicationListView title="Discovered apps" apps={apps.filter((app) => app.owner !== "Managed")} error={liveError} emptyMessage="The live inventory contains no applications awaiting review." />;
  }
  if (page === "Policies") {
    return <ApplicationListView title="Policies" apps={apps.filter((app) => app.owner === "Managed")} error={liveError} emptyMessage="No approved applications were returned by the live API." />;
  }
  if (page === "Automation" || page === "AI Update Assistant") {
    return <UnavailableWorkspace page={page} />;
  }

  const pageSubtitle = page === "Devices"
    ? "Managed devices returned by the App Guardian API."
    : page === "Updates"
      ? "Update jobs returned by the App Guardian API."
      : "Audit events returned by the App Guardian API.";

  return (
    <>
      <PageHeader title={page} subtitle={pageSubtitle} onRefresh={() => setRefreshKey((key) => key + 1)} />
      {requestError ? <UnavailableWorkspace page={page} error={requestError} /> : isLoading ? <LoadingPanel label={`Loading ${page.toLowerCase()} from the API…`} /> : records.length === 0 ? <EmptyPanel title={`No ${page.toLowerCase()} returned`} detail="The API returned no records for this view." /> : (
        <section className="panel table-panel"><PanelTitle title={`${records.length} ${page.toLowerCase()}`} /><div className="table-wrap"><table><thead><tr>{columnsFor(page).map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{records.map((record, index) => <tr key={String(record.id ?? `${page}-${index}`)}>{columnsFor(page).map((column) => <td key={column.key}>{renderValue(record[column.key])}</td>)}</tr>)}</tbody></table></div><TableFoot text="Values shown are the latest records returned by the configured API." /></section>
      )}
    </>
  );
}

export function AssistantPanel({ isLoading, liveError }: { isLoading: boolean; liveError: string }) {
  return <section className="panel assistant-panel">
    <div className="assistant-heading"><div className="assistant-icon"><Sparkles size={17} /></div><div><span className="section-eyebrow">AI UPDATE ASSISTANT</span><h2>Live recommendations</h2></div><span className="recommendation-label">RECOMMENDATION ONLY</span></div>
    <div className="assistant-live-state"><strong>{isLoading ? "Waiting for API response" : "No live recommendations available"}</strong><span>{liveError || "No AI recommendation endpoint is connected."}</span></div>
    <div className="panel-footer-link assistant-source-note"><LockKeyhole size={13} />Recommendations require live inventory, trusted vendor sources, and policy data.</div>
  </section>;
}

function ApplicationListView({ title, apps, error, emptyMessage }: { title: string; apps: AppRecord[]; error: string; emptyMessage: string }) {
  return <>
    <PageHeader title={title} subtitle="Applications returned by the current live inventory response." />
    {apps.length === 0 ? <EmptyPanel title={error ? `${title} unavailable` : `No ${title.toLowerCase()} returned`} detail={error || emptyMessage} /> : <section className="panel table-panel"><PanelTitle title={`${apps.length} applications`} /><div className="table-wrap"><table><thead><tr><th>APPLICATION</th><th>BUNDLE ID</th><th>INSTALLED</th><th>LATEST</th><th>RISK</th><th>TRUSTED SOURCE</th><th>STATUS</th></tr></thead><tbody>{apps.map((app) => <tr key={app.id}><td>{app.name}</td><td>{app.bundleId}</td><td>{app.installedVersion || "—"}</td><td>{app.latestVersion ?? "—"}</td><td>{app.risk}</td><td>{app.source ?? "—"}</td><td>{app.owner}</td></tr>)}</tbody></table></div><TableFoot text="No local approvals or policy changes are made from this view." /></section>}
  </>;
}

function SettingsView({ apiBaseURL, onSaveApiBaseURL }: { apiBaseURL: string; onSaveApiBaseURL: (url: string) => void }) {
  const [endpoint, setEndpoint] = useState(apiBaseURL);
  const [connection, setConnection] = useState("Not tested");
  const [isTesting, setIsTesting] = useState(false);
  const [message, setMessage] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const isAllowedEndpoint = (() => {
    try {
      const url = new URL(endpoint.trim());
      const localHosts = ["localhost", "127.0.0.1", "[::1]"];
      return (url.protocol === "https:" || (url.protocol === "http:" && localHosts.includes(url.hostname)))
        && !url.username && !url.password && !url.search && !url.hash;
    } catch {
      return false;
    }
  })();

  const testConnection = async () => {
    setIsTesting(true);
    setMessage("");
    try {
      const response = await fetch(`${endpoint.trim().replace(/\/$/, "")}/health`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`Health endpoint returned HTTP ${response.status}.`);
      setConnection("Connected");
    } catch (error) {
      setConnection("Not connected");
      setMessage(error instanceof Error ? error.message : "Unable to test the API connection.");
    } finally {
      setIsTesting(false);
    }
  };

  return <>
    <PageHeader title="Settings" subtitle="Configure the live API connection and review current agent permissions." />
    {message && <Notice message={message} onDismiss={() => setMessage("")} />}
    <div className="settings-page-grid">
      <section className="panel settings-panel"><PanelTitle eyebrow="APP GUARDIAN API" title="Connection" /><label className="field-label api-endpoint-field">API base URL<input type="url" value={endpoint} onChange={(event) => { setEndpoint(event.target.value); setConnection("Not tested"); }} placeholder="https://api.example.com/api/v1" aria-label="App Guardian API base URL" /></label><div className="api-connection-actions"><button className="secondary-button" onClick={() => void testConnection()} disabled={isTesting || !isAllowedEndpoint}>{isTesting ? <span className="spinner" /> : <Activity size={14} />}{isTesting ? "Testing…" : "Test connection"}</button><button className="primary-button" onClick={() => { onSaveApiBaseURL(endpoint.trim()); setMessage("API base URL saved for this browser profile."); }} disabled={!isAllowedEndpoint || endpoint.trim() === apiBaseURL}>Save API URL</button><span className={`api-connection-status ${connection === "Connected" ? "connected" : ""}`}><i />{connection}</span></div><p className="settings-helper">This URL is saved in this browser profile. Configure the same API base URL separately in the macOS agent Settings.</p></section>
      <section className="panel settings-panel"><PanelTitle eyebrow="DEVICE MANAGEMENT" title="Endpoint Central" /><p className="settings-helper">Deployment instructions for the signed agent and device-management profile.</p><button className="secondary-button settings-link" onClick={() => setShowGuide(true)}>Deployment guide <ArrowRight size={13} /></button></section>
      <section className="panel settings-panel"><PanelTitle eyebrow="CURRENT AGENT PERMISSIONS" title="macOS access" /><div className="permission-row"><CheckCircle2 size={15} /><div><strong>Application inventory</strong><span>Reads /Applications and the signed-in user’s ~/Applications.</span></div><span className="permission-state">Available</span></div><div className="permission-row"><LockKeyhole size={15} /><div><strong>Full Disk Access</strong><span>Not requested by the current read-only scanner.</span></div><span className="permission-state neutral">Not granted</span></div><div className="permission-row"><ShieldCheck size={15} /><div><strong>Privileged updates</strong><span>No privileged helper is installed.</span></div><span className="permission-state neutral">Unavailable</span></div></section>
    </div>
    {showGuide && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowGuide(false); }}><section className="workspace-dialog" role="dialog" aria-modal="true" aria-labelledby="deployment-guide-title"><button className="icon-button dialog-close" aria-label="Close deployment guide" onClick={() => setShowGuide(false)}><X size={17} /></button><div className="dialog-icon"><Laptop size={18} /></div><div className="eyebrow">MANAGEENGINE ENDPOINT CENTRAL</div><h2 id="deployment-guide-title">Deployment guide</h2><p>Deploy a signed and notarized App Guardian package through a pilot device group before broad rollout.</p><ol className="guide-steps"><li>Install the signed PKG containing the user agent and separately signed helper.</li><li>Deploy only the MDM PPPC profile required for documented scan roots.</li><li>Schedule daily scans and add the user app to Self Service.</li><li>Verify inventory reporting and helper signature checks before expanding scope.</li></ol><div className="dialog-warning"><LockKeyhole size={14} /> The privileged helper and production PKG are not available in this build.</div><div className="dialog-actions"><button className="primary-button" onClick={() => setShowGuide(false)}>Done</button></div></section></div>}
  </>;
}

function UnavailableWorkspace({ page, error }: { page: string; error?: string }) {
  return <div className="live-unavailable"><div className="coming-icon"><LockKeyhole size={19} /></div><div className="eyebrow">LIVE API</div><h1>{page}</h1><p>{error || `No live ${page.toLowerCase()} endpoint is connected.`}</p><div className="coming-status"><span className={`source-dot ${error ? "error" : "connecting"}`} />{error ? "Request failed" : "Waiting for a live API endpoint"}</div></div>;
}

function PageHeader({ title, subtitle, onRefresh }: { title: string; subtitle: string; onRefresh?: () => void }) {
  return <div className="page-heading workspace-page-heading"><div><div className="eyebrow">LIVE APP GUARDIAN DATA</div><h1>{title}</h1><p>{subtitle}</p></div>{onRefresh && <button className="secondary-button" onClick={onRefresh}><RefreshCw size={14} /> Refresh</button>}</div>;
}

function PanelTitle({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return <div className="panel-heading"><div>{eyebrow && <div className="section-eyebrow">{eyebrow}</div>}<h2>{title}</h2></div></div>;
}

function LoadingPanel({ label }: { label: string }) {
  return <div className="panel"><div className="loading-state" role="status"><span className="spinner" />{label}</div></div>;
}

function EmptyPanel({ title, detail }: { title: string; detail: string }) {
  return <div className="panel"><div className="empty-state"><div><Sparkles size={17} /></div><strong>{title}</strong><span>{detail}</span></div></div>;
}

function TableFoot({ text }: { text: string }) {
  return <div className="table-foot"><ShieldCheck size={13} />{text}</div>;
}

function Notice({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return <div className="inline-notice" role="status"><CheckCircle2 size={15} />{message}<button className="icon-button" aria-label="Dismiss" onClick={onDismiss}><X size={15} /></button></div>;
}

function columnsFor(page: WorkspacePageName): { key: string; label: string }[] {
  if (page === "Devices") return [
    { key: "hostname", label: "HOSTNAME" }, { key: "serialNumber", label: "SERIAL NUMBER" }, { key: "platformVersion", label: "MACOS" }, { key: "scanStatus", label: "SCAN STATUS" }, { key: "lastSeenAt", label: "LAST SEEN" },
  ];
  if (page === "Updates") return [
    { key: "applicationId", label: "APPLICATION" }, { key: "fromVersion", label: "INSTALLED" }, { key: "targetVersion", label: "TARGET" }, { key: "state", label: "STATE" }, { key: "scheduledFor", label: "SCHEDULED" },
  ];
  return [
    { key: "action", label: "EVENT" }, { key: "outcome", label: "RESULT" }, { key: "occurredAt", label: "TIME" }, { key: "requestId", label: "REQUEST ID" },
  ];
}

function renderValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return "—";
}