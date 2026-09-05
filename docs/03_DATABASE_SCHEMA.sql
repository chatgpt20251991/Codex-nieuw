-- EUBatteryPassport.nl core relational model (draft v0.1)
-- PostgreSQL. UUIDs generated server-side. Add RLS policies in production.

CREATE TABLE organisations (
  id uuid PRIMARY KEY,
  legal_name text NOT NULL,
  country_code char(2) NOT NULL,
  registry_identifier_type text,
  registry_identifier_value text,
  vat_number text,
  role text NOT NULL,
  verification_status text NOT NULL DEFAULT 'unverified',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY,
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  email text NOT NULL,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, email)
);

CREATE TABLE written_authorisations (
  id uuid PRIMARY KEY,
  responsible_operator_id uuid NOT NULL REFERENCES organisations(id),
  service_provider_id uuid NOT NULL REFERENCES organisations(id),
  scope_json jsonb NOT NULL,
  document_object_key text NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE suppliers (
  id uuid PRIMARY KEY,
  customer_organisation_id uuid NOT NULL REFERENCES organisations(id),
  legal_name text NOT NULL,
  contact_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE battery_models (
  id uuid PRIMARY KEY,
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  model_identifier text NOT NULL,
  category text NOT NULL CHECK (category IN ('EV','LMT','INDUSTRIAL_GT_2KWH')),
  name text,
  chemistry text,
  lifecycle_status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organisation_id, model_identifier)
);

CREATE TABLE battery_items (
  id uuid PRIMARY KEY,
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  model_id uuid NOT NULL REFERENCES battery_models(id),
  serial_or_item_identifier text NOT NULL,
  batch_identifier text,
  upi text,
  manufacture_date date,
  lifecycle_status text NOT NULL DEFAULT 'original',
  passport_state text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organisation_id, serial_or_item_identifier),
  UNIQUE(upi)
);

CREATE TABLE legal_rule_sets (
  id uuid PRIMARY KEY,
  code text NOT NULL,
  version text NOT NULL,
  effective_from date NOT NULL,
  effective_until date,
  source_uri text,
  source_hash text,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(code, version)
);

CREATE TABLE field_definitions (
  id integer NOT NULL,
  rule_set_id uuid NOT NULL REFERENCES legal_rule_sets(id),
  name text NOT NULL,
  legal_source text NOT NULL,
  access_tier text NOT NULL,
  data_nature text NOT NULL,
  applicability_json jsonb NOT NULL,
  validation_schema jsonb,
  PRIMARY KEY (id, rule_set_id)
);

CREATE TABLE passport_values (
  id uuid PRIMARY KEY,
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  model_id uuid REFERENCES battery_models(id),
  battery_item_id uuid REFERENCES battery_items(id),
  field_definition_id integer NOT NULL,
  rule_set_id uuid NOT NULL,
  value_json jsonb NOT NULL,
  unit text,
  validation_status text NOT NULL DEFAULT 'unvalidated',
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (field_definition_id, rule_set_id)
    REFERENCES field_definitions(id, rule_set_id)
);

CREATE TABLE evidence_objects (
  id uuid PRIMARY KEY,
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  supplier_id uuid REFERENCES suppliers(id),
  object_key text NOT NULL,
  original_filename text,
  mime_type text,
  sha256 text NOT NULL,
  evidence_type text NOT NULL,
  issued_at timestamptz,
  expires_at timestamptz,
  verification_status text NOT NULL DEFAULT 'unverified',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE evidence_links (
  evidence_id uuid NOT NULL REFERENCES evidence_objects(id),
  passport_value_id uuid NOT NULL REFERENCES passport_values(id),
  relationship text NOT NULL DEFAULT 'supports',
  locator_json jsonb,
  PRIMARY KEY(evidence_id, passport_value_id)
);

CREATE TABLE supplier_requests (
  id uuid PRIMARY KEY,
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  model_id uuid NOT NULL REFERENCES battery_models(id),
  requested_field_ids integer[] NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  due_at timestamptz,
  secure_token_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE compliance_checks (
  id uuid PRIMARY KEY,
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  battery_item_id uuid REFERENCES battery_items(id),
  model_id uuid REFERENCES battery_models(id),
  rule_code text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info','warning','blocker')),
  status text NOT NULL CHECK (status IN ('pass','fail','not_applicable','pending')),
  details_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  rule_set_id uuid NOT NULL REFERENCES legal_rule_sets(id),
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE passport_versions (
  id uuid PRIMARY KEY,
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  battery_item_id uuid NOT NULL REFERENCES battery_items(id),
  version_no integer NOT NULL,
  canonical_json jsonb NOT NULL,
  sha256 text NOT NULL,
  publication_state text NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(battery_item_id, version_no)
);

CREATE TABLE registry_submissions (
  id uuid PRIMARY KEY,
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  battery_item_id uuid NOT NULL REFERENCES battery_items(id),
  passport_version_id uuid REFERENCES passport_versions(id),
  method text NOT NULL,
  correlation_id text,
  registry_uri text,
  status text NOT NULL,
  request_payload jsonb,
  response_payload jsonb,
  error_report jsonb,
  submitted_at timestamptz,
  completed_at timestamptz
);

CREATE TABLE access_grants (
  id uuid PRIMARY KEY,
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  grantee_subject text NOT NULL,
  grantee_role text NOT NULL,
  battery_item_id uuid REFERENCES battery_items(id),
  model_id uuid REFERENCES battery_models(id),
  access_tier text NOT NULL,
  purpose text NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  granted_by uuid REFERENCES users(id),
  revoked_at timestamptz
);

CREATE TABLE lifecycle_events (
  id uuid PRIMARY KEY,
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  battery_item_id uuid NOT NULL REFERENCES battery_items(id),
  event_type text NOT NULL,
  event_time timestamptz NOT NULL,
  payload jsonb NOT NULL,
  previous_passport_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE telemetry_readings (
  id bigserial PRIMARY KEY,
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  battery_item_id uuid NOT NULL REFERENCES battery_items(id),
  measured_at timestamptz NOT NULL,
  metric text NOT NULL,
  value double precision,
  unit text,
  payload jsonb,
  source text,
  integrity_hash text
);

CREATE TABLE audit_events (
  id bigserial PRIMARY KEY,
  organisation_id uuid,
  actor_subject text,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  before_hash text,
  after_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_passport_values_item ON passport_values(battery_item_id);
CREATE INDEX idx_passport_values_model ON passport_values(model_id);
CREATE INDEX idx_telemetry_item_time ON telemetry_readings(battery_item_id, measured_at DESC);
CREATE INDEX idx_registry_item ON registry_submissions(battery_item_id);
CREATE INDEX idx_compliance_item ON compliance_checks(battery_item_id, severity, status);
