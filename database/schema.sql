CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE user_role AS ENUM (
  'ADMIN',
  'REVIEWER'
);

CREATE TYPE contract_status AS ENUM (
  'UPLOADED',
  'ANALYZING',
  'AI_ANALYZED',
  'UNDER_REVIEW',
  'COMPLETED',
  'CHANGES_REQUESTED'
);

CREATE TYPE risk_level AS ENUM (
  'HIGH',
  'MEDIUM',
  'LOW'
);

CREATE TYPE finding_status AS ENUM (
  'PENDING',
  'ACCEPTED',
  'DISMISSED'
);

CREATE TYPE review_status AS ENUM (
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'CHANGES_REQUESTED'
);

CREATE TYPE reviewer_invitation_status AS ENUM (
  'PENDING',
  'ACCEPTED',
  'EXPIRED',
  'REVOKED'
);

CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Legal company information
  name VARCHAR(255) NOT NULL,
  trade_name VARCHAR(255),

  -- Company information
  industry VARCHAR(100) NOT NULL,
  country VARCHAR(100) NOT NULL,
  state_province VARCHAR(100),
  website VARCHAR(255) NOT NULL,

  -- Legal contact information
  legal_contact_name VARCHAR(255),
  legal_contact_email VARCHAR(255),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX companies_name_lower_uniq
ON companies(LOWER(name));

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  clerk_user_id VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  role user_role NOT NULL DEFAULT 'REVIEWER',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_company_id
ON users(company_id);

CREATE INDEX idx_users_role
ON users(role);

CREATE UNIQUE INDEX users_company_email_lower_uniq
ON users(company_id, LOWER(BTRIM(email)));

CREATE TABLE reviewer_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invited_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  invited_email VARCHAR(255) NOT NULL
    CHECK (invited_email = LOWER(BTRIM(invited_email))),
  token_hash BYTEA NOT NULL UNIQUE
    CHECK (OCTET_LENGTH(token_hash) = 32),
  status reviewer_invitation_status NOT NULL DEFAULT 'PENDING',
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (expires_at > created_at),
  CHECK ((status = 'ACCEPTED') = (accepted_at IS NOT NULL)),
  CHECK ((status = 'REVOKED') = (revoked_at IS NOT NULL)),
  CHECK (accepted_user_id IS NULL OR status = 'ACCEPTED')
);

CREATE UNIQUE INDEX idx_reviewer_invitations_pending_email
ON reviewer_invitations(company_id, invited_email)
WHERE status = 'PENDING';

CREATE INDEX idx_reviewer_invitations_company_created
ON reviewer_invitations(company_id, created_at DESC);

CREATE INDEX idx_reviewer_invitations_pending_expiry
ON reviewer_invitations(expires_at)
WHERE status = 'PENDING';

CREATE INDEX idx_reviewer_invitations_invited_by_user
ON reviewer_invitations(invited_by_user_id);

CREATE INDEX idx_reviewer_invitations_accepted_user
ON reviewer_invitations(accepted_user_id);

CREATE TABLE contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  assigned_reviewer_id UUID REFERENCES users(id),
  contract_name VARCHAR(255) NOT NULL,
  vendor_name VARCHAR(255) NOT NULL,
  description TEXT,
  status contract_status NOT NULL DEFAULT 'UPLOADED',
  risk_score INTEGER CHECK (risk_score BETWEEN 0 AND 100),
  risk_level risk_level,
  final_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contracts_company_id
ON contracts(company_id);

CREATE INDEX idx_contracts_status
ON contracts(status);

CREATE INDEX idx_contracts_assigned_reviewer
ON contracts(assigned_reviewer_id);

CREATE TABLE contract_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_key TEXT NOT NULL,
  file_url TEXT,
  mime_type VARCHAR(100) NOT NULL,
  file_size BIGINT NOT NULL,
  page_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contract_documents_contract_id
ON contract_documents(contract_id);

CREATE TABLE contract_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  page_number INTEGER,
  section VARCHAR(255),
  qdrant_point_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contract_chunks_contract_id
ON contract_chunks(contract_id);

CREATE TABLE policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  file_name VARCHAR(255),
  file_key TEXT,
  file_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_policies_company_id
ON policies(company_id);

CREATE TABLE policy_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  page_number INTEGER,
  section VARCHAR(255),
  qdrant_point_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_policy_chunks_policy_id
ON policy_chunks(policy_id);

CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL UNIQUE REFERENCES contracts(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES users(id),
  status review_status NOT NULL DEFAULT 'PENDING',
  final_notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reviews_reviewer_id
ON reviews(reviewer_id);

CREATE TABLE risk_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  review_id UUID REFERENCES reviews(id) ON DELETE SET NULL,
  risk_level risk_level NOT NULL,
  title VARCHAR(255) NOT NULL,
  reason TEXT NOT NULL,
  evidence TEXT NOT NULL,
  page_number INTEGER,
  section VARCHAR(255),
  related_policy_id UUID REFERENCES policies(id) ON DELETE SET NULL,
  recommendation TEXT,
  status finding_status NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_risk_findings_contract_id
ON risk_findings(contract_id);

CREATE INDEX idx_risk_findings_review_id
ON risk_findings(review_id);

CREATE TABLE review_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id UUID NOT NULL REFERENCES risk_findings(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES users(id),
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_review_comments_finding_id
ON review_comments(finding_id);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_company_id
ON audit_logs(company_id);

CREATE INDEX idx_audit_logs_contract_id
ON audit_logs(contract_id);

CREATE INDEX idx_audit_logs_created_at
ON audit_logs(created_at);
