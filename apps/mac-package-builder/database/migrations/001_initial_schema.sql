CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE tenant_role AS ENUM ('admin', 'helpdesk', 'auditor', 'end_user');
CREATE TYPE app_disposition AS ENUM ('approved', 'pending_review', 'blocked');
CREATE TYPE update_ring AS ENUM ('pilot', 'broad', 'critical_security');
CREATE TYPE update_state AS ENUM ('queued', 'downloading', 'validating', 'installing', 'succeeded', 'failed', 'rolled_back', 'deferred', 'cancelled');
CREATE TYPE source_kind AS ENUM ('vendor_api', 'vendor_pkg', 'vendor_dmg', 'sparkle_appcast', 'microsoft_autoupdate', 'homebrew_cask');

CREATE TABLE tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    oidc_issuer text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    oidc_subject text NOT NULL,
    email text NOT NULL,
    display_name text NOT NULL,
    role tenant_role NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, oidc_subject),
    UNIQUE (tenant_id, email)
);

CREATE TABLE devices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    serial_number text NOT NULL,
    hostname text NOT NULL,
    platform_version text NOT NULL,
    endpoint_central_device_id text,
    last_logged_in_user text,
    last_seen_at timestamptz,
    last_scan_at timestamptz,
    scan_status text NOT NULL DEFAULT 'unknown' CHECK (scan_status IN ('unknown', 'queued', 'running', 'succeeded', 'failed')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, serial_number)
);

CREATE TABLE trusted_sources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    kind source_kind NOT NULL,
    display_name text NOT NULL,
    endpoint text NOT NULL,
    allowed_hosts text[] NOT NULL DEFAULT '{}',
    expected_team_ids text[] NOT NULL DEFAULT '{}',
    expected_sha256 text,
    enabled boolean NOT NULL DEFAULT true,
    created_by uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (kind <> 'homebrew_cask' OR enabled = false OR cardinality(expected_team_ids) > 0)
);

CREATE TABLE applications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bundle_id text NOT NULL,
    display_name text NOT NULL,
    disposition app_disposition NOT NULL DEFAULT 'pending_review',
    trusted_source_id uuid REFERENCES trusted_sources(id),
    expected_team_ids text[] NOT NULL DEFAULT '{}',
    update_ring update_ring NOT NULL DEFAULT 'broad',
    silent_update_allowed boolean NOT NULL DEFAULT false,
    graceful_quit_allowed boolean NOT NULL DEFAULT false,
    policy jsonb NOT NULL DEFAULT '{}'::jsonb,
    approved_by uuid REFERENCES users(id),
    approved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, bundle_id),
    CHECK (disposition <> 'approved' OR (trusted_source_id IS NOT NULL AND cardinality(expected_team_ids) > 0))
);

CREATE TABLE app_inventory (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    application_id uuid REFERENCES applications(id),
    bundle_id text NOT NULL,
    app_name text NOT NULL,
    installed_version text NOT NULL,
    bundle_version text,
    install_path text NOT NULL,
    install_source text NOT NULL,
    signing_team_id text,
    code_signature_valid boolean,
    last_modified_at timestamptz,
    observed_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (device_id, bundle_id, install_path)
);

CREATE TABLE update_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    application_id uuid NOT NULL REFERENCES applications(id),
    source_id uuid NOT NULL REFERENCES trusted_sources(id),
    from_version text NOT NULL,
    target_version text NOT NULL,
    state update_state NOT NULL DEFAULT 'queued',
    scheduled_for timestamptz,
    attempt integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
    validation_results jsonb NOT NULL DEFAULT '[]'::jsonb,
    error_code text,
    error_detail text,
    requested_by uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    CHECK (from_version <> target_version)
);

CREATE TABLE audit_events (
    id bigserial PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    actor_user_id uuid REFERENCES users(id),
    device_id uuid REFERENCES devices(id),
    application_id uuid REFERENCES applications(id),
    update_job_id uuid REFERENCES update_jobs(id),
    action text NOT NULL,
    outcome text NOT NULL CHECK (outcome IN ('success', 'failure', 'denied', 'info')),
    request_id text,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX devices_tenant_last_seen_idx ON devices (tenant_id, last_seen_at DESC);
CREATE INDEX inventory_device_observed_idx ON app_inventory (device_id, observed_at DESC);
CREATE INDEX update_jobs_tenant_state_idx ON update_jobs (tenant_id, state, created_at DESC);
CREATE INDEX audit_events_tenant_time_idx ON audit_events (tenant_id, occurred_at DESC);
CREATE INDEX applications_tenant_disposition_idx ON applications (tenant_id, disposition);

CREATE FUNCTION prevent_audit_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit_events is append-only';
END;
$$;

CREATE TRIGGER audit_events_immutable
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation();