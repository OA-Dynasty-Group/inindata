-- Phase 4: Advanced Permissions - Field-level access and project membership
-- Apply with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/002_advanced_permissions.sql

BEGIN;

-- Track project memberships: users can only access their assigned projects
CREATE TABLE fieldwork.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES fieldwork.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES fieldwork.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES fieldwork.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES fieldwork.roles(id) ON DELETE CASCADE,
  permissions text[] DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(project_id, user_id),
  CONSTRAINT project_role_tenancy CHECK (
    -- role must belong to the same organization as project
    EXISTS (
      SELECT 1 FROM fieldwork.projects p
      WHERE p.id = project_id AND p.organization_id = organization_id
    )
  )
);

CREATE TRIGGER set_project_members_updated_at BEFORE UPDATE ON fieldwork.project_members
  FOR EACH ROW EXECUTE FUNCTION fieldwork.set_updated_at();

CREATE INDEX idx_project_members_user ON fieldwork.project_members(user_id);
CREATE INDEX idx_project_members_project ON fieldwork.project_members(project_id);

-- Track field-level access: which users can view/edit specific fields
CREATE TABLE fieldwork.field_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES fieldwork.organizations(id) ON DELETE CASCADE,
  instrument_id uuid NOT NULL REFERENCES fieldwork.instruments(id) ON DELETE CASCADE,
  field_key text NOT NULL, -- e.g., "respondent_phone", "respondent_email"
  classification text DEFAULT 'public' CHECK (classification IN ('public', 'internal', 'confidential')), -- data classification
  role_id uuid REFERENCES fieldwork.roles(id) ON DELETE CASCADE,
  user_id uuid REFERENCES fieldwork.users(id) ON DELETE CASCADE,
  can_view boolean DEFAULT true,
  can_export boolean DEFAULT false,
  can_edit boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT field_access_scope CHECK (
    -- Either role_id OR user_id must be specified (not both, not neither)
    (role_id IS NOT NULL AND user_id IS NULL) OR (role_id IS NULL AND user_id IS NOT NULL)
  )
);

CREATE TRIGGER set_field_access_updated_at BEFORE UPDATE ON fieldwork.field_access
  FOR EACH ROW EXECUTE FUNCTION fieldwork.set_updated_at();

CREATE INDEX idx_field_access_instrument ON fieldwork.field_access(instrument_id);
CREATE INDEX idx_field_access_role ON fieldwork.field_access(role_id);
CREATE INDEX idx_field_access_user ON fieldwork.field_access(user_id);
CREATE INDEX idx_field_access_field ON fieldwork.field_access(instrument_id, field_key);

-- Add data classification to instruments
ALTER TABLE fieldwork.instruments
  ADD COLUMN IF NOT EXISTS data_classification text DEFAULT 'public' CHECK (data_classification IN ('public', 'internal', 'confidential'));

-- Add field masking metadata to instruments
ALTER TABLE fieldwork.instruments
  ADD COLUMN IF NOT EXISTS pii_fields text[] DEFAULT '[]'; -- array of field keys that contain PII

-- Track access logs for audit trail
CREATE TABLE fieldwork.access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES fieldwork.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES fieldwork.users(id) ON DELETE CASCADE,
  action text NOT NULL, -- 'view_field', 'export_data', 'access_denied'
  resource_type text NOT NULL, -- 'instrument', 'submission', 'dataset'
  resource_id uuid,
  field_key text, -- for field-level access
  status text DEFAULT 'allowed' CHECK (status IN ('allowed', 'denied')), -- whether access was granted
  reason text, -- reason if denied
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_access_logs_user ON fieldwork.access_logs(user_id);
CREATE INDEX idx_access_logs_resource ON fieldwork.access_logs(resource_type, resource_id);
CREATE INDEX idx_access_logs_created ON fieldwork.access_logs(created_at);

-- Add approval workflow tracking
CREATE TABLE fieldwork.approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES fieldwork.organizations(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES fieldwork.users(id) ON DELETE CASCADE,
  approver_id uuid REFERENCES fieldwork.users(id) ON DELETE SET NULL,
  action text NOT NULL, -- 'export_pii', 'view_confidential', 'bulk_delete'
  resource_type text NOT NULL, -- 'instrument', 'dataset', 'submission'
  resource_id uuid NOT NULL,
  field_key text, -- for field-level requests
  details jsonb DEFAULT '{}',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz,
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TRIGGER set_approval_requests_updated_at BEFORE UPDATE ON fieldwork.approval_requests
  FOR EACH ROW EXECUTE FUNCTION fieldwork.set_updated_at();

CREATE INDEX idx_approval_requests_status ON fieldwork.approval_requests(status);
CREATE INDEX idx_approval_requests_requester ON fieldwork.approval_requests(requester_id);
CREATE INDEX idx_approval_requests_approver ON fieldwork.approval_requests(approver_id);

COMMIT;
