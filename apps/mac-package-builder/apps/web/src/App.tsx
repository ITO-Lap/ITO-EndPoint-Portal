import { useEffect, useState } from "react";
import {
  Activity,
  AppWindow,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bot,
  Check,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Command,
  Grid2X2,
  Laptop,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  SearchCheck,
  Search,
  Settings2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { type AppRecord } from "./data";
import { AssistantPanel, WorkspaceViews, type WorkspacePageName } from "./LiveWorkspaceViews";

type Page = "Overview" | "Devices" | "My Apps" | "Discovered Apps" | "Updates" | "AI Update Assistant" | "Automation" | "Policies" | "Activity" | "Settings";
type DashboardData = { secureScore: number; appsScanned: number; updatesReady: number; criticalRisks: number; deviceName?: string; lastScanAt?: string };
type ActivityRecord = { id: string; title: string; detail: string; time: string; state: "done" | "warning" };
type ApiApplication = { id: string; bundleId: string; name: string; installedVersion: string; latestVersion: string | null; disposition: "approved" | "pending_review" | "blocked"; risk: "low" | "medium" | "high" | "critical"; sourceName: string | null; updateReady: boolean };

const navigation: { name: Page; icon: typeof Grid2X2 }[] = [
  { name: "Overview", icon: Grid2X2 },
  { name: "Devices", icon: Laptop },
  { name: "My Apps", icon: AppWindow },
  { name: "Discovered Apps", icon: SearchCheck },
  { name: "Updates", icon: ArrowDownToLine },
  { name: "AI Update Assistant", icon: Bot },
  { name: "Automation", icon: Command },
  { name: "Policies", icon: ShieldAlert },
  { name: "Activity", icon: Activity },
  { name: "Settings", icon: Settings2 },
];

function App() {
  const [page, setPage] = useState<Page>("Overview");
  const [apiBaseURL, setApiBaseURL] = useState(() => localStorage.getItem("appGuardian.apiBaseURL") ?? import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1");
  const [apps, setApps] = useState<AppRecord[]>([]);
  const [summary, setSummary] = useState<DashboardData | null>(null);
  const [activity, setActivity] = useState<ActivityRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [liveError, setLiveError] = useState("");
  const [query, setQuery] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [agentLaunchMessage, setAgentLaunchMessage] = useState("");

  const launchLocalAgent = () => {
    setAgentLaunchMessage("Requesting the local App Guardian agent. Approve the browser prompt if shown; install the macOS agent if nothing opens.");
    const protocolLink = document.createElement("a");
    protocolLink.href = "appguardian://open";
    protocolLink.style.position = "fixed";
    protocolLink.style.left = "-10000px";
    document.body.appendChild(protocolLink);
    protocolLink.click();
    protocolLink.remove();
  };

  useEffect(() => {
    const controller = new AbortController();
    const base = apiBaseURL.replace(/\/$/, "");
    setApps([]);
    setSummary(null);
    setActivity([]);
    setIsLoading(true);
    setLiveError("");
    let active = true;
    let firstLoad = true;
    let inFlight = false;

    const fetchPayload = async <T,>(path: string): Promise<T> => {
      const response = await fetch(`${base}${path}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`${path} responded with HTTP ${response.status}.`);
      return await response.json() as T;
    };

    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      const [appsResult, summaryResult] = await Promise.allSettled([
        fetchPayload<{ data: ApiApplication[] }>("/apps"),
        fetchPayload<{ data: DashboardData & { recentActivity?: { id?: string; action: string; outcome: string; occurredAt: string; details?: Record<string, unknown> }[] } }>("/dashboard/summary"),
      ]);
      if (active) {
        const failures: string[] = [];
        if (appsResult.status === "fulfilled" && Array.isArray(appsResult.value.data)) {
          setApps(appsResult.value.data.map((app) => ({
            id: app.id,
            name: app.name,
            bundleId: app.bundleId,
            installedVersion: app.installedVersion,
            latestVersion: app.latestVersion,
            owner: app.disposition === "approved" ? "Managed" : app.disposition === "blocked" ? "Blocked" : "Review",
            risk: `${app.risk[0].toUpperCase()}${app.risk.slice(1)}` as AppRecord["risk"],
            source: app.sourceName,
            updateReady: app.updateReady,
          })));
        } else {
          setApps([]);
          failures.push(appsResult.status === "rejected" ? appsResult.reason instanceof Error ? appsResult.reason.message : "Apps request failed." : "Apps API returned an invalid response.");
        }

        if (summaryResult.status === "fulfilled" && summaryResult.value.data) {
          setSummary(summaryResult.value.data);
          setActivity((summaryResult.value.data.recentActivity ?? []).map((event, index) => ({
            id: event.id ?? `${event.action}-${index}`,
            title: event.action.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
            detail: String(event.details?.summary ?? event.details?.message ?? event.outcome),
            time: new Date(event.occurredAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
            state: event.outcome === "success" ? "done" : "warning",
          })));
        } else {
          setSummary(null);
          setActivity([]);
          failures.push(summaryResult.status === "rejected" ? summaryResult.reason instanceof Error ? summaryResult.reason.message : "Dashboard request failed." : "Dashboard API returned an invalid response.");
        }
        setLiveError([...new Set(failures)].join(" "));
        if (firstLoad) {
          firstLoad = false;
          setIsLoading(false);
        }
      }
      inFlight = false;
    };

    void refresh();
    const intervalId = window.setInterval(() => void refresh(), 30_000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      controller.abort();
    };
  }, [apiBaseURL]);

  const filteredApps = apps.filter((app) =>
    `${app.name} ${app.bundleId}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`} aria-label="Main navigation">
        <div className="brand-lockup">
          <div className="brand-mark"><ShieldCheck size={23} strokeWidth={2.2} /></div>
          <div><strong>App Guardian</strong><span>Managed Mac updates</span></div>
          <button className="icon-button mobile-close" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation"><X size={18} /></button>
        </div>
        <button className="workspace-switcher" onClick={launchLocalAgent} title="Open App Guardian on this Mac" aria-label="Launch local App Guardian agent">
          <div className="workspace-avatar">A</div>
          <div className="workspace-copy"><strong>AKV Studio</strong><span>Click to open local Mac agent</span></div>
          <ArrowUpRight size={15} />
        </button>
        <div className="nav-caption">WORKSPACE</div>
        <nav className="nav-list">
          {navigation.map(({ name, icon: Icon }) => (
            <button key={name} className={`nav-item ${page === name ? "active" : ""}`} onClick={() => { setPage(name); setMobileNavOpen(false); }} aria-current={page === name ? "page" : undefined}>
              <Icon size={17} strokeWidth={1.9} /><span>{name}</span>
              {name === "Updates" && <span className="nav-count">{liveError ? "—" : apps.filter((app) => app.updateReady).length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="support-callout"><CircleHelp size={17} /><div><strong>Need a hand?</strong><span>Visit the help center</span></div><ArrowRight size={14} /></div>
          <button className="profile-row" aria-label="Account menu">
            <div className="profile-avatar">AV</div><div><strong>Avinash Verma</strong><span>Account</span></div><MoreHorizontal size={17} />
          </button>
        </div>
      </aside>

      {mobileNavOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
          <label className="global-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search apps, updates or settings..." aria-label="Search apps, updates or settings" /><kbd>⌘ K</kbd></label>
          <div className="topbar-actions">
            <div className="source-select" role="status" aria-live="polite"><span className={`source-dot ${liveError ? "error" : isLoading ? "connecting" : "live"}`} />{liveError ? "API unavailable" : isLoading ? "Connecting" : "Live data"}</div>
            <button className="icon-button notification-button" aria-label="Notifications"><Bell size={18} /><i /></button>
            <button className="top-avatar" aria-label="Open profile menu">AV</button>
          </div>
        </header>

        <div className="page-content">
          <div className={`mode-banner ${liveError ? "error-banner" : "live-banner"}`}><span><span className={`source-dot ${liveError ? "error" : isLoading ? "connecting" : "live"}`} /> {liveError ? "Live API unavailable" : isLoading ? "Connecting to App Guardian API" : "Live API"}</span><span>{liveError || "Only data returned by the configured API is displayed. No local fallback is used."}</span></div>
          {agentLaunchMessage && <div className="launch-agent-notice" role="status">{agentLaunchMessage}<button className="icon-button" onClick={() => setAgentLaunchMessage("")} aria-label="Dismiss launch message"><X size={14} /></button></div>}
          {page === "Overview" ? <Overview onNavigate={setPage} apps={apps} summary={summary} activity={activity} isLoading={isLoading} liveError={liveError} /> : page === "My Apps" ? <MyApps apps={filteredApps} query={query} summary={summary} isLoading={isLoading} liveError={liveError} /> : <WorkspaceViews page={page as WorkspacePageName} apps={apps} liveError={liveError} apiBaseURL={apiBaseURL} onSaveApiBaseURL={(url) => { localStorage.setItem("appGuardian.apiBaseURL", url); setApiBaseURL(url); }} />}
        </div>
      </main>
    </div>
  );
}

function Overview({ onNavigate, apps, summary, activity, isLoading, liveError }: { onNavigate: (page: Page) => void; apps: AppRecord[]; summary: DashboardData | null; activity: ActivityRecord[]; isLoading: boolean; liveError: string }) {
  const [notice, setNotice] = useState("");
  const readyApps = apps.filter((app) => app.updateReady).slice(0, 5);
  const healthScore = summary?.secureScore ?? 0;
  const deviceName = summary?.deviceName ?? "Your device";
  const unavailableAction = liveError || "Device scan actions are not available from the connected API.";
  return (
    <>
      <div className="page-heading">
        <div><div className="eyebrow">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).toUpperCase()} <span className="heading-separator">/</span> THIS DEVICE</div><h1>Good morning, Avinash</h1><p>Here’s the update health of your Mac today.</p></div>
        <button className="secondary-button scan-button" onClick={() => setNotice(unavailableAction)}><Activity size={15} /> Scan now</button>
      </div>
      {notice && <div className="inline-notice" role="status"><CircleHelp size={16} />{notice}<button className="icon-button" aria-label="Dismiss" onClick={() => setNotice("")}><X size={15} /></button></div>}

      <section className="overview-grid" aria-label="Device update summary">
        <div className="health-panel">
          <div className="health-ring" style={{ background: `conic-gradient(#09aa6c 0 ${healthScore}%, #d1e8dc ${healthScore}% 100%)` }} role="img" aria-label={`${summary?.secureScore ?? "Unknown"} percent secure and current`}><div><strong>{summary ? <>{healthScore}<small>%</small></> : "—"}</strong><span>SECURE</span></div></div>
          <div className="health-copy"><div className="health-kicker"><span className="health-dot" /> DEVICE HEALTH</div><h2>{summary ? "Secure & current" : "Health unavailable"}</h2><p>{summary ? "Your Mac apps are up to date and protected." : "Connect to the API to load device health."}</p><div className="health-foot"><Laptop size={14} /> {deviceName} <span>·</span> {summary?.lastScanAt ? `Scanned ${new Date(summary.lastScanAt).toLocaleString()}` : "Last scan unavailable"}</div></div>
          <div className="health-sparkline" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
        </div>
        <StatCard icon={Grid2X2} value={summary ? String(summary.appsScanned) : "—"} label="Apps scanned" note={summary ? "Across this device" : "Waiting for API"} tone="blue" />
        <StatCard icon={ArrowDownToLine} value={summary ? String(summary.updatesReady) : "—"} label="Updates ready" note={summary ? "Approved updates" : "Waiting for API"} tone="green" />
        <StatCard icon={Shield} value={summary ? String(summary.criticalRisks) : "—"} label="Critical risks" note={summary ? (summary.criticalRisks ? "Needs attention" : "All clear") : "Waiting for API"} tone="red" />
      </section>

      <section className="content-grid">
        <div className="panel updates-panel">
          <div className="panel-heading"><div><div className="section-eyebrow">ACTION REQUIRED</div><h2>Updates ready <span className="heading-count">{isLoading || liveError ? "—" : readyApps.length}</span></h2></div><button className="text-button" onClick={() => onNavigate("Updates")}>View updates <ArrowRight size={14} /></button></div>
          {isLoading ? <LoadingRows /> : readyApps.length ? <div className="update-list">
            {readyApps.map((app) => <UpdateRow key={app.id} app={app} onUpdate={() => setNotice(unavailableAction)} onSchedule={() => setNotice(unavailableAction)} />)}
          </div> : <EmptyState title={liveError ? "Updates unavailable" : "No updates ready"} detail={liveError || "The API returned no approved updates for this device."} />}
          <button className="panel-footer-link" onClick={() => onNavigate("Updates")}>See all updates <ArrowRight size={14} /></button>
        </div>

        <div className="panel activity-panel">
          <div className="panel-heading"><div><div className="section-eyebrow">YOUR DEVICE</div><h2>Recent activity</h2></div><button className="icon-button subtle-button" aria-label="More activity options"><MoreHorizontal size={19} /></button></div>
          <div className="activity-timeline">
            {activity.length ? activity.slice(0, 3).map((event, index) => <ActivityItem key={event.id} icon={index === 0 ? Check : index === 1 ? ShieldCheck : ArrowDownToLine} title={event.title} detail={event.detail} time={event.time} state={event.state} last={index === Math.min(activity.length, 3) - 1} />) : <EmptyState title={liveError ? "Activity unavailable" : "No recent activity"} detail={liveError || (isLoading ? "Loading device activity…" : "The API returned no recent activity.")} />}
          </div>
          <button className="panel-footer-link" onClick={() => onNavigate("Activity")}>View activity log <ArrowRight size={14} /></button>
        </div>
      </section>

      <AssistantPanel isLoading={isLoading} liveError={liveError} />
      <div className="trust-note"><LockKeyhole size={13} /><span>Inventory comes from the configured API. Update installation requires a deployed helper and approved sources.</span><button aria-label="About update verification"><CircleHelp size={14} /></button></div>
    </>
  );
}

function StatCard({ icon: Icon, value, label, note, tone }: { icon: typeof Grid2X2; value: string; label: string; note: string; tone: string }) {
  return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={17} strokeWidth={2.1} /></div><div className="stat-value">{value}</div><div className="stat-label">{label}</div><div className="stat-note">{note}</div></div>;
}

function UpdateRow({ app, onUpdate, onSchedule }: { app: AppRecord; onUpdate: () => void; onSchedule: () => void }) {
  return <div className="update-row"><AppGlyph app={app} /><div className="update-app-name"><strong>{app.name}</strong><span>{app.installedVersion} <ArrowRight size={11} /> {app.latestVersion ?? "—"}</span></div><RiskTag risk={app.risk} /><button className="primary-button update-action" onClick={onUpdate}>Update</button><button className="schedule-button" onClick={onSchedule} aria-label={`Schedule ${app.name} update`} title="Schedule update"><Clock3 size={15} /></button></div>;
}

function MyApps({ apps, query, summary, isLoading, liveError }: { apps: AppRecord[]; query: string; summary: DashboardData | null; isLoading: boolean; liveError: string }) {
  const [filter, setFilter] = useState("All apps");
  const [notice, setNotice] = useState("");
  const visibleApps = apps.filter((app) => filter === "All apps" || (filter === "Updates ready" ? app.updateReady : app.owner === filter));
  return <>
    <div className="page-heading"><div><div className="eyebrow">SOFTWARE INVENTORY <span className="heading-separator">/</span> {liveError ? "—" : apps.length} APPS</div><h1>My apps</h1><p>Applications installed on {summary?.deviceName ?? "your device"}.</p></div><button className="secondary-button" disabled={apps.length === 0}><ArrowDownToLine size={15} /> Export list</button></div>
    {notice && <div className="inline-notice" role="status"><CircleHelp size={16} />{notice}<button className="icon-button" aria-label="Dismiss" onClick={() => setNotice("")}><X size={15} /></button></div>}
    <div className="inventory-toolbar"><div className="filter-tabs" role="tablist" aria-label="Filter applications">{["All apps", "Updates ready", "Managed", "Review", "Blocked"].map((item) => <button key={item} role="tab" aria-selected={filter === item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item}{item === "Updates ready" && <span>{apps.filter((app) => app.updateReady).length}</span>}</button>)}</div><label className="table-search"><Search size={15} /><input value={query} readOnly aria-label="Filter app inventory" placeholder="Filter apps" /></label></div>
    <div className="panel inventory-panel"><div className="table-wrap"><table><thead><tr><th>APPLICATION</th><th>INSTALLED</th><th>LATEST</th><th>STATUS</th><th>RISK</th><th>SOURCE</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>
      {isLoading ? <tr><td colSpan={7}><LoadingRows /></td></tr> : visibleApps.map((app) => <tr key={app.id}><td><div className="table-app"><AppGlyph app={app} /><div><strong>{app.name}</strong><span>{app.bundleId}</span></div></div></td><td className="version-cell">{app.installedVersion}</td><td className="version-cell">{app.latestVersion}</td><td><OwnerTag owner={app.owner} /></td><td><RiskTag risk={app.risk} /></td><td className="source-cell">{app.source}</td><td>{app.updateReady ? <button className="primary-button table-update" onClick={() => setNotice(liveError || "Update actions are not available from the connected API.")}>Update</button> : <span aria-label="No update available">—</span>}</td></tr>)}
      {!isLoading && visibleApps.length === 0 && <tr><td colSpan={7}><EmptyState title={liveError ? "Inventory unavailable" : query ? "No matching apps" : "No applications returned"} detail={liveError || (query ? `No apps match “${query}”.` : "The API returned no applications for this device.")} /></td></tr>}
    </tbody></table></div><div className="table-bottom"><span>{liveError && apps.length === 0 ? "Inventory unavailable" : `Showing ${visibleApps.length} of ${apps.length} applications`}</span><span>{summary?.lastScanAt ? `Last inventory scan · ${new Date(summary.lastScanAt).toLocaleString()}` : "Last inventory scan unavailable"}</span></div></div>
    <div className="inventory-footnote"><ShieldCheck size={15} /><span>App ownership and update sources are assigned by your organization. Discovered apps need review before updates are available.</span></div>
  </>;
}

function AppGlyph({ app }: { app: AppRecord }) { return <span className="app-glyph" style={{ backgroundColor: "#edf2f7", color: "#4c657d" }}>{app.name.slice(0, 1).toUpperCase()}</span>; }

function RiskTag({ risk }: { risk: AppRecord["risk"] }) { return <span className={`risk-tag ${risk.toLowerCase()}`}><span />{risk}</span>; }
function OwnerTag({ owner }: { owner: AppRecord["owner"] }) { const Icon = owner === "Managed" ? CheckCircle2 : owner === "Review" ? Clock3 : TriangleAlert; return <span className={`owner-tag ${owner.toLowerCase()}`}><Icon size={12} />{owner === "Review" ? "Pending review" : owner}</span>; }
function ActivityItem({ icon: Icon, title, detail, time, state, last = false }: { icon: typeof Check; title: string; detail: string; time: string; state: string; last?: boolean }) { return <div className={`activity-item ${last ? "last" : ""}`}><div className={`activity-marker ${state}`}><Icon size={14} strokeWidth={2.5} /></div><div className="activity-copy"><strong>{title}</strong><span>{detail}</span></div><time>{time}</time></div>; }
function LoadingRows() { return <div className="loading-state" role="status"><span className="spinner" /> Loading inventory…</div>; }
function EmptyState({ title, detail }: { title: string; detail: string }) { return <div className="empty-state"><div><Sparkles size={17} /></div><strong>{title}</strong><span>{detail}</span></div>; }
export default App;