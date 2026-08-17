-- Fieldwork initial PostgreSQL schema
-- PostgreSQL 15+. Apply with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/001_initial_schema.sql
-- This migration is intentionally append-only: use a new numbered migration for changes.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS fieldwork;
SET search_path = fieldwork, public;

CREATE OR REPLACE FUNCTION fieldwork.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fieldwork.prevent_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events are append-only';
END;
$$;

CREATE OR REPLACE FUNCTION fieldwork.prevent_version_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% records are immutable', TG_TABLE_NAME;
END;
$$;

-- Foreign keys establish existence; these triggers also prevent cross-organization links.
CREATE OR REPLACE FUNCTION fieldwork.enforce_tenant_relationships()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'projects' AND NOT EXISTS (
    SELECT 1 FROM programs p WHERE p.id = NEW.program_id AND p.organization_id = NEW.organization_id
  ) THEN RAISE EXCEPTION 'project program must belong to its organization';
  ELSIF TG_TABLE_NAME = 'instruments' AND (
    (NEW.program_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM programs p WHERE p.id = NEW.program_id AND p.organization_id = NEW.organization_id)) OR
    (NEW.project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = NEW.project_id AND p.organization_id = NEW.organization_id AND (NEW.program_id IS NULL OR p.program_id = NEW.program_id)))
  ) THEN RAISE EXCEPTION 'instrument program/project must belong to its organization and program';
  ELSIF TG_TABLE_NAME = 'datasets' AND (
    (NEW.instrument_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM instruments i WHERE i.id = NEW.instrument_id AND i.organization_id = NEW.organization_id)) OR
    (NEW.project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = NEW.project_id AND p.organization_id = NEW.organization_id))
  ) THEN RAISE EXCEPTION 'dataset dependencies must belong to its organization';
  ELSIF TG_TABLE_NAME = 'submissions' AND (
    NOT EXISTS (SELECT 1 FROM instruments i WHERE i.id = NEW.instrument_id AND i.organization_id = NEW.organization_id) OR
    (NEW.dataset_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM datasets d WHERE d.id = NEW.dataset_id AND d.organization_id = NEW.organization_id))
  ) THEN RAISE EXCEPTION 'submission dependencies must belong to its organization';
  ELSIF TG_TABLE_NAME = 'reports' AND (
    (NEW.dataset_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM datasets d WHERE d.id = NEW.dataset_id AND d.organization_id = NEW.organization_id)) OR
    (NEW.project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = NEW.project_id AND p.organization_id = NEW.organization_id))
  ) THEN RAISE EXCEPTION 'report dependencies must belong to its organization';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fieldwork.enforce_user_role_tenancy()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users u JOIN roles r ON r.organization_id = u.organization_id
    WHERE u.id = NEW.user_id AND r.id = NEW.role_id
  ) THEN RAISE EXCEPTION 'user and role must belong to the same organization';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (btrim(name) <> ''),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  UNIQUE (slug)
);

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (code ~ '^[a-z][a-z0-9:_-]*$'),
  name text NOT NULL CHECK (btrim(name) <> ''),
  description text NOT NULL DEFAULT '',
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(permissions) = 'array'),
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  UNIQUE (organization_id, code)
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  email text NOT NULL,
  display_name text NOT NULL CHECK (btrim(display_name) <> ''),
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'invited')),
  last_login_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- Case-insensitive uniqueness is enforced only for non-deleted accounts below.
  deleted_at timestamptz
);
CREATE UNIQUE INDEX users_active_email_ci ON users (organization_id, lower(email)) WHERE deleted_at IS NULL;

CREATE TABLE user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  granted_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  ip inet,
  user_agent text
);
CREATE INDEX auth_sessions_active_user_idx ON auth_sessions (user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_-]*$'),
  name text NOT NULL CHECK (btrim(name) <> ''),
  description text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  UNIQUE (organization_id, code)
);

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  program_id uuid NOT NULL REFERENCES programs(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_-]*$'),
  name text NOT NULL CHECK (btrim(name) <> ''),
  description text NOT NULL DEFAULT '',
  starts_on date,
  ends_on date,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  UNIQUE (program_id, code),
  CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX projects_org_program_idx ON projects (organization_id, program_id) WHERE deleted_at IS NULL;

CREATE TABLE instruments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  program_id uuid REFERENCES programs(id) ON DELETE RESTRICT,
  project_id uuid REFERENCES projects(id) ON DELETE RESTRICT,
  key text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_-]*$'),
  title text NOT NULL CHECK (btrim(title) <> ''),
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  draft_definition jsonb NOT NULL DEFAULT '{"sections":[]}'::jsonb CHECK (jsonb_typeof(draft_definition) = 'object'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  UNIQUE (organization_id, key),
  CHECK (project_id IS NULL OR program_id IS NOT NULL)
);
CREATE INDEX instruments_org_status_idx ON instruments (organization_id, status) WHERE deleted_at IS NULL;

CREATE TABLE instrument_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id uuid NOT NULL REFERENCES instruments(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number > 0),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  definition_checksum text NOT NULL,
  published_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (instrument_id, version_number),
  UNIQUE (instrument_id, definition_checksum),
  UNIQUE (id, instrument_id)
);
CREATE INDEX instrument_versions_published_idx ON instrument_versions (instrument_id, published_at DESC);

-- Stable, opaque collection URLs. Store only a digest of the actual bearer token.
CREATE TABLE collection_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_version_id uuid NOT NULL REFERENCES instrument_versions(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE,
  label text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  max_submissions integer CHECK (max_submissions IS NULL OR max_submissions > 0),
  submission_count integer NOT NULL DEFAULT 0 CHECK (submission_count >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX collection_links_available_idx ON collection_links (token_hash) WHERE enabled;

CREATE TABLE datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  instrument_id uuid REFERENCES instruments(id) ON DELETE RESTRICT,
  project_id uuid REFERENCES projects(id) ON DELETE RESTRICT,
  key text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_-]*$'),
  name text NOT NULL CHECK (btrim(name) <> ''),
  description text NOT NULL DEFAULT '',
  schema_definition jsonb NOT NULL DEFAULT '{"fields":[]}'::jsonb CHECK (jsonb_typeof(schema_definition) = 'object'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  UNIQUE (organization_id, key)
);

CREATE TABLE submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  instrument_id uuid NOT NULL REFERENCES instruments(id) ON DELETE RESTRICT,
  instrument_version_id uuid NOT NULL,
  dataset_id uuid REFERENCES datasets(id) ON DELETE RESTRICT,
  collection_link_id uuid REFERENCES collection_links(id) ON DELETE SET NULL,
  external_id text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'rejected', 'locked')),
  answers jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(answers) = 'object'),
  context jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(context) = 'object'),
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reviewed_at timestamptz,
  reviewed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  review_note text NOT NULL DEFAULT '',
  locked_at timestamptz,
  locked_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  CHECK ((status IN ('approved', 'rejected', 'locked')) = (reviewed_at IS NOT NULL)),
  CHECK ((status = 'locked') = (locked_at IS NOT NULL)),
  CONSTRAINT submissions_version_belongs_to_instrument
    FOREIGN KEY (instrument_version_id, instrument_id)
    REFERENCES instrument_versions (id, instrument_id) ON DELETE RESTRICT
);
CREATE INDEX submissions_queue_idx ON submissions (organization_id, status, submitted_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX submissions_instrument_idx ON submissions (instrument_id, instrument_version_id, submitted_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX submissions_answers_gin ON submissions USING gin (answers jsonb_path_ops);
CREATE UNIQUE INDEX submissions_external_id_uniq ON submissions (dataset_id, external_id) WHERE external_id IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  dataset_id uuid REFERENCES datasets(id) ON DELETE RESTRICT,
  project_id uuid REFERENCES projects(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (btrim(name) <> ''),
  description text NOT NULL DEFAULT '',
  definition jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(definition) = 'object'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz
);
CREATE INDEX reports_org_idx ON reports (organization_id) WHERE deleted_at IS NULL;

CREATE TABLE dashboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (btrim(name) <> ''),
  description text NOT NULL DEFAULT '',
  layout jsonb NOT NULL DEFAULT '{"widgets":[]}'::jsonb CHECK (jsonb_typeof(layout) = 'object'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz
);
CREATE INDEX dashboards_org_idx ON dashboards (organization_id) WHERE deleted_at IS NULL;

CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action ~ '^[A-Z][A-Z0-9_:.]*$'),
  resource_type text NOT NULL CHECK (resource_type ~ '^[a-z][a-z0-9_:-]*$'),
  resource_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_id uuid,
  ip inet,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX audit_events_org_time_idx ON audit_events (organization_id, occurred_at DESC);
CREATE INDEX audit_events_resource_idx ON audit_events (resource_type, resource_id, occurred_at DESC);
CREATE INDEX audit_events_metadata_gin ON audit_events USING gin (metadata jsonb_path_ops);

CREATE TRIGGER organizations_set_updated BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER roles_set_updated BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER users_set_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER programs_set_updated BEFORE UPDATE ON programs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER projects_set_updated BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER instruments_set_updated BEFORE UPDATE ON instruments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER collection_links_set_updated BEFORE UPDATE ON collection_links FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER datasets_set_updated BEFORE UPDATE ON datasets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER submissions_set_updated BEFORE UPDATE ON submissions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER reports_set_updated BEFORE UPDATE ON reports FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER dashboards_set_updated BEFORE UPDATE ON dashboards FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER projects_tenant_check BEFORE INSERT OR UPDATE OF organization_id, program_id ON projects FOR EACH ROW EXECUTE FUNCTION enforce_tenant_relationships();
CREATE TRIGGER instruments_tenant_check BEFORE INSERT OR UPDATE OF organization_id, program_id, project_id ON instruments FOR EACH ROW EXECUTE FUNCTION enforce_tenant_relationships();
CREATE TRIGGER datasets_tenant_check BEFORE INSERT OR UPDATE OF organization_id, instrument_id, project_id ON datasets FOR EACH ROW EXECUTE FUNCTION enforce_tenant_relationships();
CREATE TRIGGER submissions_tenant_check BEFORE INSERT OR UPDATE OF organization_id, instrument_id, dataset_id ON submissions FOR EACH ROW EXECUTE FUNCTION enforce_tenant_relationships();
CREATE TRIGGER reports_tenant_check BEFORE INSERT OR UPDATE OF organization_id, dataset_id, project_id ON reports FOR EACH ROW EXECUTE FUNCTION enforce_tenant_relationships();
CREATE TRIGGER user_roles_tenant_check BEFORE INSERT OR UPDATE OF user_id, role_id ON user_roles FOR EACH ROW EXECUTE FUNCTION enforce_user_role_tenancy();
CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
CREATE TRIGGER instrument_versions_immutable BEFORE UPDATE OR DELETE ON instrument_versions FOR EACH ROW EXECUTE FUNCTION prevent_version_mutation();

COMMIT;
