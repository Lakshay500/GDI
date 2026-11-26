## Windows 11 integration handoff

For the Docker Desktop + WSL2 integration host setup, follow [`docs/deployment/windows-11-docker-desktop.md`](docs/deployment/windows-11-docker-desktop.md). The PowerShell helper is `scripts/windows-integration.ps1`. This is a prepared runbook, not evidence that the stack has already been deployed on Windows.

# Government Document Integrity Verification System (GDI-VS)

**Project:** AI-Powered Anomaly Detection for Official Government Document Integrity  
**Institution:** K.R. Mangalam University — School of Engineering and Technology  
**Project reference:** 26O2386  
**Specification:** The Super Prompt, version 3.0  
**Version:** 1.0.1
**Status:** Foundation scaffold — architecture and implementation decisions remain subject to the project checklist and owner approval.

## Release status (v0.80.0)

Workstream 80 adds a versioned AES-256-GCM IPFS encryption keyring with per-object key identifiers, plus safer transactional-outbox worker claiming, bounded retry scheduling and stale-processing recovery for Fabric anchoring. Targeted IPFS, Fabric-client and outbox tests pass (16 tests). Live IPFS/Fabric and PostgreSQL concurrency acceptance remain outstanding. See `docs/storage/workstream-80-ipfs-fabric-reliability.md` and `docs/release/workstream-80-release-v0.76.0.md`.

Workstream 81 adds a read-only, organisation-scoped cross-system reconciliation endpoint comparing the database SHA-256 record, IPFS pin/object content and Fabric ledger digest result. It distinguishes unavailable services, missing historical keys and integrity failures, and explicitly performs no automatic repair. Targeted IPFS, Fabric-client, transactional-outbox and verification orchestration tests pass (40 tests). Live Kubo/Fabric and PostgreSQL multi-worker acceptance remain outstanding. See `docs/audit/workstream-81-reconciliation.md` and `docs/release/workstream-81-release-v0.77.0.md`.

Workstream 82 (v0.78.0) adds a tenant-scoped storage recovery queue and an explicitly authorised retry operation for failed IPFS-to-Fabric outbox events. Manual retry requires a pinned IPFS reference, SHA-256 digest and active issuer; already-committed records are completed idempotently rather than submitted again. The operation is audited and never recreates or overwrites document content. Recovery queue counts are scoped to the returned 100-item page. Live IPFS/Fabric, multi-worker PostgreSQL and end-to-end repair acceptance remain outstanding. See `docs/storage/workstream-82-recovery-management.md` and `docs/release/workstream-82-release-v0.78.0.md`.

Workstream 83 (v0.79.0) adds a dedicated Storage & Ledger Operations frontend workspace using the existing organisation-scoped IPFS/Fabric recovery queue and administrator-only retry endpoint. It displays returned-page status counts, event age/attempt information, last errors for administrators, truncation warnings and controlled requeue actions. The interface explicitly distinguishes outbox state from live IPFS pin health and Fabric ledger availability. It performs no automatic object repair or ledger re-anchoring. Live infrastructure acceptance remains outstanding. See `docs/storage/workstream-83-operations-workspace.md` and `docs/release/workstream-83-release-v0.79.0.md`.


Workstream 84 (v0.80.0) adds an administrator-facing System Health workspace and explicit configured/unconfigured/unavailable dependency states while retaining the legacy boolean dependency map. Prometheus alerting now includes sustained average request latency and unavailable queue-depth telemetry; the Grafana overview adds queue depth, broker availability and latency panels. Targeted health/observability/smoke tests pass (13 tests). Live infrastructure, alert delivery, Grafana import and a dependency-installed frontend production build remain outstanding. See `docs/operations/workstream-84-system-health-observability.md` and `docs/release/workstream-84-release-v0.80.0.md`.

## Previous release status (v0.66.0)

Workstream 67 adds organisation-scoped native-file verification from document-version records, with separate evidence findings and explicit limitations. See `docs/frontend/workstream-67-native-file-verification-workspace.md`.

Workstream 66 adds an accessible document-version upload workspace on document detail pages. The drop area accepts PDF, PNG, JPEG and TXT files, enforces a client-side 20 MiB limit and rejects empty files before sending the upload to the existing authenticated, organisation-scoped API. Uploads remain in quarantine and require safety processing. The UI indicates an active transfer but does not report a fabricated percentage; browser-level progress, full Vite build and live upload integration remain to be verified. See `docs/frontend/workstream-66-document-upload-workspace.md`.

## Previous release status (v0.62.0)

Workstream 64 begins the frontend-first completion phase. The document registry now supports client-side search across title, external reference, issuer and document type; status filtering; bounded pagination; and accessible result counts. These controls operate only on records already returned by the organisation-scoped API and do not imply server-side filtering or complete repository pagination. Frontend dependency installation timed out in this environment, so the production build and browser-level behaviour remain unverified. See `docs/frontend/workstream-64-frontend-first-increment.md`.

Workstream 62 adds an operator wrapper for deploying the chaincode to the official Fabric Samples test network and a real peer-CLI acceptance script that grants a test issuer authorisation, registers a document digest, waits for commit events, reads the committed record back, and requires `VerifyDocument=true`. Shell syntax and local regression checks are recorded in `Debug/research/workstream-62-validation.txt`. Docker and the Fabric peer CLI are absent in this environment, so live deployment and transaction acceptance remain pending; no ledger transaction is claimed. See `docs/verification/workstream-62-real-fabric-deployment-acceptance.md` and `blockchain/network/acceptance/README.md`.

Workstream 60 adds a standalone Go evidence-verification utility, public-key fingerprint pinning and portable attestation bundle export. See `docs/verification/workstream-60-independent-ledger-verification.md`.

Workstream 59 adds Fabric evidence event submission and retrieval through the Gateway bridge, plus tenant-scoped API endpoints to anchor and query signed evidence attestations. Live Fabric transactions remain unverified. See `docs/verification/workstream-59-external-evidence-anchoring.md`.

## Historical release status (v0.50.0)

**Development foundation / pre-release — not accepted as MVP or production release.** The backend suite passed 190 tests in the Workstream 56 local run (SQLite-based test environment). A local FastAPI + SQLite deployment smoke run passed liveness, readiness, metrics and OpenAPI route checks; PostgreSQL, Redis, ClamAV, IPFS, a responsive Celery worker, Hyperledger Fabric and clean Docker deployment remain unverified. See [release assessment](docs/release/release-candidate-assessment-v0.33.0.md), [integrated deployment checkpoint](docs/release/integrated-deployment-acceptance-v0.34.0.md), [Windows core integration gate](docs/release/windows-integration-gate-v0.36.0.md), and [Celery worker health gate](docs/release/worker-health-gate-v0.37.0.md), the [285-item master checklist evidence register](docs/requirements/master-checklist-evidence.csv), and the [Windows integration runbook](docs/deployment/windows-11-docker-desktop.md).

## Latest AI research workstream (v0.50.0)

Workstream 53 (v0.50.0) adds a tenant-scoped immutable model artefact registry and lifecycle API. Signed governance approvals are bound to exact model artefact SHA-256 values. The registry stores metadata/fingerprints only; it does not store model binaries or deploy inference services. See `docs/ai/workstream-53-model-registry-lifecycle.md`.

## Running on macOS Sequoia

For a complete first-time setup, administrator bootstrap, frontend launch, GUI walkthrough, troubleshooting and shutdown instructions, see the [macOS Sequoia installation and user guide](docs/deployment/macos-sequoia-setup-and-user-guide.md). The [technology stack inventory](docs/architecture/technology-stack.md) lists the languages, frameworks, databases, infrastructure and integrations present in this source release. The [local Docker Compose deployment guide](docs/deployment/local-compose.md) documents the service topology.

**Release caveat:** v1.0.1 is a development baseline. Dependency lockfiles are incomplete, and frontend semantic compilation, production bundling and browser acceptance have not been verified as passing. The setup guide documents these limitations and the supported local development workflow.

## Purpose

GDI-VS is intended to ingest official or institutional documents, extract textual/visual/metadata evidence, identify suspicious patterns, verify cryptographic integrity and signatures, establish issuer trust, preserve provenance, and support accountable human review.

**Core distinction:** anomaly detection, byte-level integrity, issuer authorisation, signature validity, lifecycle status, and human judgement are separate findings. No single hash, blockchain transaction, or AI score establishes legal authenticity.

## Accessibility and localisation

The frontend includes keyboard-navigation foundations, accessible modal behaviour, locale-aware formatting, and an initial English (UK)/Hindi (India) interface-language pilot. This is not a WCAG 2.2 AA conformance claim; see `docs/accessibility/accessibility-internationalisation.md` for implemented controls and outstanding audits. OCR language requirements remain subject to project-owner approval.

## Repository map

```text
backend/             FastAPI service and backend tests
Debug/               Personal project-owner workspace (non-runtime snapshots)
frontend/            React + TypeScript + Vite application
ml/                  Dataset, feature, training and evaluation work
blockchain/          Hyperledger Fabric network artefacts and chaincode
infrastructure/      Local infrastructure and deployment configuration
docs/                Requirements, architecture, ADRs, security and API docs
tests/               Cross-component and end-to-end tests
.github/workflows/   CI workflows
```

## Current state

The requirements register is a traceability aid, not evidence that the product is complete. This repository is an evolving development foundation. The issuer registry and document metadata APIs are implemented with tenant-scoped access, role guards, lifecycle records and transactional audit events. Binary ingestion accepts allow-listed PDF, PNG, JPEG and UTF-8 text files into local quarantine, creates document-version and SHA-256 records, and surfaces same-tenant duplicate hashes. A ClamAV adapter and authenticated scan endpoint are implemented, followed by bounded structural validation in a separate process. OCR is now represented by a provisional Tesseract adapter and bounded extraction worker; OCR accuracy evaluation, semantic field extraction, approved ML inference, production-grade sandbox isolation, external issuer credential validation, digital-signature validation, live Fabric transactions and live IPFS workflows remain incomplete.

See:
- [Identity and access implementation](docs/security/identity-and-access.md)
- [Issuer Registry API](docs/api/issuer-registry.md)
- [Document Metadata Registry API](docs/api/document-registry.md)
- [Development status](docs/STATUS.md)
- [Requirements Traceability Matrix — CSV](docs/requirements/requirements-traceability.csv)
- [Requirements traceability guide](docs/requirements/requirements-traceability.md)
- [SRS baseline draft](docs/requirements/SRS-baseline.md)
- [Project-owner decisions](docs/PROJECT-OWNER-DECISIONS.md)
- [Architecture baseline](docs/architecture/overview.md)
- [System context diagram](docs/architecture/system-context.mmd)
- [Conceptual database ER diagram](docs/architecture/conceptual-er.mmd)
- [API resource catalogue](docs/api/resource-catalogue.md)
- [Registration sequence](docs/architecture/document-registration-sequence.mmd)
- [Verification sequence](docs/architecture/verification-sequence.mmd)
- [Decision records](docs/decisions/)
- [Security and trust model](docs/security/trust-model.md)

## Prerequisites

- Git
- Python 3.12+
- Node.js 22 LTS+
- Docker Engine/Desktop with Compose v2

Versions above are initial development targets and must be checked against the selected dependency versions before the environment is declared reproducible. Repository hosting is intentionally deferred; development can proceed from this portable working copy.

## Local development

### 1. Configure environment

```bash
cp .env.example .env
```

Replace all development secrets before exposing services beyond localhost. Never commit `.env`.

### 2. Start the local integration stack

Generate unique local secrets and replace the placeholders in `.env` (see [Docker Compose deployment](docs/deployment/local-compose.md)). The default Compose stack includes PostgreSQL, Redis, the migration job, API, Celery worker/scheduler, ClamAV and IPFS.

```bash
docker compose config
docker compose up --build -d
docker compose ps
curl -fsS http://127.0.0.1:8000/health
curl -fsS http://127.0.0.1:8000/ready
```

Alembic migrations run as a one-shot service before the API and workers start.

### 3. Run backend locally (alternative to the containerised API)

```bash
cd backend
python -m venv .venv
# macOS/Linux
source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -e '.[dev]'
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Health endpoint: `http://127.0.0.1:8000/health`  
OpenAPI UI: `http://127.0.0.1:8000/docs`

When running the backend outside Compose, apply database migrations from `backend/` with `alembic upgrade head`. Provision the first administrator with `python scripts_bootstrap_admin.py` from `backend/` in a trusted terminal. See [identity and access](docs/security/identity-and-access.md) for the security configuration and limitations.

### 4. Run frontend

```bash
cd frontend
npm install
npm run dev
```

Vite prints the local development URL.

## Engineering rules

1. The Super Prompt v3.0 is the controlling and complete development checklist until formally superseded.
2. The original PowerPoint is deliberately excluded from the governing source set; it is not a dependency or acceptance prerequisite.
3. Every requirement must be traceable to implementation, tests and evidence.
4. `COMPLETED` and `VERIFIED` are different states. `VERIFIED` requires passing tests and recorded evidence.
5. Do not use mock data to imply real operational capability.
6. Do not describe a Fabric or IPFS stub as an integration.
7. Record consequential technical choices as Architecture Decision Records (ADRs).
8. Record security, privacy, licensing and operational limitations honestly.
9. Keep AI anomaly findings distinct from cryptographic and issuer-trust findings.
10. Human review remains a separately recorded decision, not an invisible override of automated evidence.

## Checklist status vocabulary

- `NOT STARTED`
- `IN PROGRESS`
- `BLOCKED`
- `UNDER TESTING`
- `COMPLETED`
- `VERIFIED`

Every task record should include an ID, description, priority, dependencies, effort, owner, dates, status, test status, evidence and known issues.

## Backend database foundation (v0.2.0)

The backend now includes SQLAlchemy 2.x domain models and Alembic migrations for the initial 18-table relational foundation.

### Local setup

1. Copy `.env.example` to `.env` at the repository root and replace the development database password.
2. Start dependencies with `docker compose up -d postgres redis`.
3. In `backend/`, install the project and development dependencies: `python -m pip install -e '.[dev]'`.
4. Set `DATABASE_URL` in your shell to the PostgreSQL connection string from `.env` (or load it with your preferred environment manager).
5. Run `alembic upgrade head`.
6. Start the API with `uvicorn app.main:app --reload`.

If `DATABASE_URL` is not set, the backend falls back to a local SQLite file (`backend/gdivs-dev.db`) for basic development only. PostgreSQL remains the intended authoritative datastore. SQLite tests do not replace PostgreSQL integration tests.

### Operational endpoints

- `GET /health`: process liveness only.
- `GET /ready`: database connectivity readiness.

The initial authenticated issuer registry is available at `/api/v1/issuers`, and document metadata operations are available at `/api/v1/documents`. Both are organisation-scoped and role-guarded. The document API supports metadata registration, binary version upload, quarantine scanning, and a second structural-validation gate. A clean result from both gates still does not release a file for OCR or verification processing. See the [Issuer Registry API](docs/api/issuer-registry.md), [Document Metadata Registry API](docs/api/document-registry.md), [Structural Validation](docs/security/structural-validation.md), and [Background Processing](docs/ingestion/background-processing.md).

See `docs/architecture/data-model-baseline.md`, `docs/api/initial-contracts.md` and ADR-0004 before extending the schema or adding business routes.


## Issuer registry (v0.5.0)

The first business workflow is available after database migrations and administrator provisioning. Authenticated organisation administrators can create and manage issuers and attach credential references. Issuers start as `PENDING` with trust level `UNASSESSED`; activating an issuer is not itself proof of legal authority. Cross-organisation access is denied. Run `PYTHONPATH=. pytest -q` from `backend/` to execute the backend suite. Current API integration tests use SQLite; run PostgreSQL validation before treating the data layer as verified.


## Document metadata registry (v0.6.0)

The API now supports metadata registration, listing, retrieval and lifecycle transitions under `/api/v1/documents`. Registration requires an active issuer in the same organisation. Each change creates lifecycle and audit records. This does not yet upload binary content or create versions, hashes, signatures, IPFS objects or Fabric transactions. The backend test suite currently passes 22 tests using SQLite.


## Binary document ingestion (v0.8.0)

`POST /api/v1/documents/{document_id}/versions` accepts authenticated, organisation-scoped multipart uploads. PDF, PNG, JPEG and UTF-8 plain text are allow-listed and checked against their leading signatures/content. Uploads are streamed in chunks, limited by `MAX_UPLOAD_BYTES` (20 MiB development default), fingerprinted with SHA-256, and stored under generated tenant-scoped UUID paths in local quarantine. The database records a document version, hash, storage reference and audit event. Exact same-tenant hash matches are returned as duplicate indicators rather than automatically rejected.

**Safety boundary:** successful upload means receipt and fingerprinting only. Files start `QUARANTINED` and `NOT_SCANNED`. The authenticated scan endpoint uses a ClamAV INSTREAM adapter and fails closed if the scanner is unavailable. Before scanning, the API re-hashes the quarantined bytes and compares them with the upload-time SHA-256 and byte count; tampering is rejected and audited before ClamAV is called. After a clean malware result, a bounded subprocess performs structural checks (PDF page count/dimensions, image dimensions/pixel count, and UTF-8 text validity). Invalid files are rejected and removed; validator failures leave files quarantined. Even a clean structural result remains `SCAN_CLEAN` with `processing_release=PENDING_POLICY`; OCR and ML are not triggered. The subprocess is not yet a full OS sandbox. Local filesystem storage is a development adapter and is not approved for production. See [Document upload and ingestion](docs/ingestion/document-upload.md), [Malware scanning](docs/security/malware-scanning.md), [Structural Validation](docs/security/structural-validation.md), [ADR-0009](docs/decisions/ADR-0009-secure-document-binary-ingestion.md), and [ADR-0011](docs/decisions/ADR-0011-bounded-document-structural-validation.md).


## Asynchronous safety processing

Redis and Celery now provide a dedicated document-safety queue. Start `postgres` and `redis`, then build and start `api` and `document-worker` with Docker Compose. The authenticated queue endpoint is `POST /api/v1/documents/versions/{version_id}/processing-jobs`; query its persisted state with the corresponding `GET` endpoint. The worker re-hashes the file and runs the existing malware and structural gates. It does not yet invoke OCR or ML. See [Background Processing](docs/ingestion/background-processing.md). Runtime integration with Docker, Redis, Celery, PostgreSQL and live ClamAV remains unverified in this environment.


## Document extraction (v0.9.0)

After the safety worker marks a document `SCAN_CLEAN` and the safety job `SUCCEEDED`, an authorised processing role can queue extraction with `POST /api/v1/documents/versions/{version_id}/extraction-jobs`. The existing processing status endpoint exposes extraction state and a summary. PDF embedded text, page dimensions, word geometry and selected document properties are extracted with PyMuPDF; scanned PDF pages and PNG/JPEG images use a provisional Tesseract TSV adapter. UTF-8 text is extracted directly. OCR confidence and word bounding boxes are retained, and OCR-derived text is explicitly labelled. The structured result is stored as a restricted derived JSON artefact, not copied into relational metadata. See [Document Extraction](docs/ingestion/document-extraction.md) and [ADR-0013](docs/decisions/ADR-0013-document-extraction.md). OCR engine selection has not been benchmarked on a representative corpus, and live Redis/Celery/Docker/ClamAV integration remains unverified.

## Structured document intelligence (v0.11.0)

The extraction worker now appends a deterministic, evidence-preserving structured-field stage to the derived extraction artefact. It identifies issue-date candidates only on labelled lines, captures explicitly labelled reference/document/certificate numbers, and matches issuer names only against active issuers registered within the same organisation. Ambiguous dates, invalid dates and multiple reference candidates are preserved rather than silently resolved. This is a rule-based baseline (`DETERMINISTIC_RULES_NO_ML`), not a trained AI model or authenticity decision. The processing status endpoint exposes the structured-field stage summary. See [Structured Field Extraction](docs/intelligence/structured-field-extraction.md) and [ADR-0014](docs/decisions/ADR-0014-deterministic-structured-fields.md).

## Versioned document schema validation (v0.11.0)

A versioned deterministic schema registry now runs after structured-field extraction. Definitions can specify document category, issuer, required and optional fields, value patterns, issue-date bounds, template references, schema version and effective date. The registry intentionally ships empty because institutionally approved document-specific rules have not yet been provided; an unregistered document type receives an informational `SCHEMA_NOT_REGISTERED` result rather than being judged against invented requirements. Configured mismatches and missing/ambiguous required fields produce review findings, never fraud verdicts. Template references are metadata only; visual template comparison and schema approval workflows are not implemented. See [Document Schema Registry](docs/ingestion/document-schema-registry.md) and [ADR-0015](docs/decisions/ADR-0015-versioned-document-schema-validation.md).


## Anomaly detection baseline (v0.12.0)

The extraction worker now emits a versioned, explainable numeric feature record derived from page text/OCR, structured-field extraction and schema findings. A scikit-learn Isolation Forest utility supports explicit offline training (minimum 20 feature rows), deterministic scoring and labelled-set precision/recall/F1 reporting. No model is currently trained or deployed because no vetted representative document corpus has been supplied; therefore the live pipeline records `FEATURES_READY_MODEL_NOT_DEPLOYED` and does not invent anomaly scores. The score produced by a future approved model is not a probability of fraud. See [Anomaly Detection Baseline](docs/ai/anomaly-detection-baseline.md) and [ADR-0014](docs/decisions/ADR-0014-anomaly-feature-baseline.md).

## Dataset governance and baseline comparison (v0.14.0)

Workstream 14 adds a research-authorised dataset record contract, feature-schema consistency checks, group-aware holdout splitting, and experimental comparison utilities for Isolation Forest, One-Class SVM and novelty-mode Local Outlier Factor. The comparison requires explicit normal-only training labels and fits feature scaling on training data only. It reports precision, recall, F1 and confusion matrices on the supplied holdout.

These are experimental utilities, not a persistent dataset registry or model approval system. No real labelled corpus is included, no production model is trained or deployed, and synthetic test fixtures are not evidence of real-world fraud-detection performance. See `docs/ai/dataset-governance-and-baseline-comparison.md`.

## Issuer PKI foundation (v0.14.0)

Issuer administrators can register tenant-scoped PEM public keys, rotate or revoke them, and inspect their SHA-256 fingerprints. Private keys are rejected. See [Issuer PKI documentation](docs/issuer-pki.md) and [ADR-0016](docs/decisions/ADR-0016-issuer-pki-registry.md). This milestone is a public-key registry, not yet a complete X.509 trust-chain, OCSP/CRL, HSM/KMS, or issuer identity-proofing implementation.


## Certificate trust-chain validation (v0.15.0)

The backend now includes an isolated X.509 chain-validation service. It validates certificate validity periods, issuer/subject linkage, certificate signatures, CA BasicConstraints, CA keyCertSign usage when present, path-length constraints, leaf digitalSignature usage when KeyUsage is present, and termination at an explicitly configured trust-anchor PEM. Optional PEM CRLs are checked for issuer, signature, freshness, and revoked serials. Callers can require CRLs, in which case missing revocation data fails closed.

This is a constrained path validator, not a complete RFC 5280 implementation: it does not evaluate name constraints, certificate policies, AIA fetching, OCSP, delta CRLs, or complex cross-signing/path-building. It is not yet exposed as a production API and must not be used as the sole production trust decision until reviewed and replaced or backed by a mature PKI path-validation implementation. No trust anchors are bundled; deployment must explicitly provision trusted roots.

## Detached digital-signature verification (v0.16.0)

The API now verifies detached signatures against the exact stored document bytes and an active public key registered to that document's issuer. It rechecks the stored SHA-256 and byte count, applies tenant scoping, checks key validity/revocation and issuer active status, and records an auditable result. Supported algorithms: RSA-PSS-SHA256, RSA-PKCS1v1.5-SHA256, ECDSA-SHA256, Ed25519 and Ed448. The result deliberately remains `SIGNATURE_VALID_ISSUER_ACTIVE_TRUST_UNESTABLISHED`: certificate binding, certificate-chain and CRL/OCSP integration, trusted timestamping, signature-payload retention, legal issuer authority policy, and IPFS/Fabric integration are not yet complete. See [signature verification security notes](docs/security/digital-signature-verification.md) and [ADR-0018](docs/decisions/ADR-0018-end-to-end-signature-verification.md).

## Hyperledger Fabric integration baseline (v0.18.0)

A real Fabric chaincode package and official Go Gateway SDK bridge have been added under `blockchain/`. The FastAPI service now has a fail-closed gateway adapter and organisation-scoped ledger registration/verification endpoints. The bridge requires an independently provisioned Fabric network, CA-issued client identity, TLS trust root, channel, chaincode deployment and issuer authorisation. No simulated ledger or bundled development trust anchors are used. See [Fabric integration](docs/blockchain/fabric-integration.md) and the [deployment runbook](blockchain/network/DEPLOYMENT.md).

**Runtime status:** Fabric dependencies could not be downloaded in this environment, and Docker is unavailable. The chaincode, Gateway SDK bridge and live ledger transactions have therefore not been compiled or exercised here. Python adapter and API tests are the only executable evidence for this milestone. The current DB-to-ledger commit reconciliation path also needs an outbox/recovery worker before production use.

## Encrypted IPFS storage baseline (v0.19.0)

A Kubo client and tenant-scoped IPFS API have been added. Documents are encrypted with AES-256-GCM before upload; only ciphertext is sent to Kubo. The CID and integrity metadata are persisted in the existing storage-reference table. Retrieval verifies ciphertext SHA-256, authenticated decryption, plaintext SHA-256 and byte count. Fabric registration now includes the IPFS CID when a pinned reference exists. See [encrypted IPFS storage](docs/storage/ipfs-encrypted-storage.md) and [ADR-0019](docs/decisions/ADR-0019-encrypted-ipfs-storage.md).

**Runtime status:** unit tests cover encryption/decryption, missing/invalid key rejection, tampering and digest mismatch. No live Kubo node or Docker runtime was available, so add/cat/pin behavior and live Fabric anchoring remain unverified. The environment-variable AES key is development-only; production KMS/HSM envelope encryption, key rotation, independent pin replication, retention, disaster recovery and cross-system reconciliation remain outstanding.

## Distributed transaction reliability (v0.20.0)

IPFS pinning now persists a `IPFS_REFERENCE_PINNED` outbox event in the same PostgreSQL transaction as the storage reference. A Celery worker submits the corresponding Fabric anchor and records a ledger transaction only after the Gateway confirms success. Temporary Gateway failures are retried; permanent transaction rejection is dead-lettered. The API reports `ledger_anchor_status: PENDING` separately from the successful IPFS pin.

Run a Celery Beat process alongside the document worker to dispatch committed `PENDING`/`RETRY` outbox rows after broker/API interruptions. This is at-least-once delivery; chaincode-level idempotency and live outage/concurrency tests are still required. See [ADR-0020](docs/decisions/ADR-0020-transactional-outbox.md).


## Human review and case management (v0.22.0)

The backend now provides organisation-scoped review cases, evidence snapshots, reviewer assignment, case listing/detail, recorded decisions with rationales and evidence references, separation-of-duties checks for final decisions, and linked escalation cases. Review cases never rewrite cryptographic evidence or the automated verification result. Secondary approval, cryptographically chained audit history, notification delivery and frontend case-management screens remain outstanding.

## Public QR verification (v0.23.0)

The API can issue opaque, expiring public verification links and return an SVG QR code. Only a SHA-256 hash of each bearer token is stored. Organisation-authorised users can revoke links. The public endpoint returns a restricted summary and does not expose document binaries, extracted personal data, reviewer notes or internal evidence. Configure `PUBLIC_VERIFY_BASE_URL` to the canonical HTTPS origin; link issuance fails closed without it. See [Public QR verification](docs/public-verification.md) for deployment requirements, including ingress/WAF rate limiting, token-log redaction and SPA fallback configuration. This public lookup is not itself an authenticity certificate and does not perform a fresh live ledger/PKI verification.


## Administrative frontend (v0.24.0)

The React application now provides an authenticated organisation workspace with role-aware navigation and controls, an operational overview, issuer and document registries, document version upload, safety-scan and extraction job submission, QR verification-link creation, public verification, and review-case evidence viewing. The frontend calls the existing FastAPI endpoints; it does not mock backend records. Access and refresh tokens are held in `sessionStorage` and cleared on sign-out.

Run the API on `http://127.0.0.1:8000`, then start the frontend:

```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api` to `http://127.0.0.1:8000` by default. Override the target with `VITE_API_PROXY`. For a separately hosted API, set `VITE_API_BASE` at build time. Configure `PUBLIC_VERIFY_BASE_URL` to the deployed HTTPS frontend origin before issuing QR links. Production hosting must provide SPA fallback for `/verify/{token}` and appropriate CSP, TLS, rate limiting and token-log redaction.

**Frontend verification status:** the source has been implemented, but dependency installation timed out in the build environment. `npm run build` could not complete because React and Vite dependencies were not installed; no successful frontend build is claimed. Backend tests do not constitute frontend build or browser integration evidence. The UI exposes existing APIs only; it does not implement missing backend capabilities such as case-decision APIs for every workflow, reviewer SLA notifications, or live infrastructure health.


## Frontend completion (v0.25.0)

The administrative UI now includes refresh-token rotation and one-time request retry, live document processing-status polling, review decision and escalation forms, issuer public-key registration/listing/revocation, and organisation-scoped public QR-link listing/revocation. See `docs/frontend-completion.md` for endpoints, security boundaries and verification limitations. The frontend production build remains unverified because dependency installation timed out in the current environment.

## Live deployment and environment integration (v0.27.0)

The Compose deployment now includes a one-shot Alembic migration service and starts PostgreSQL, Redis, ClamAV and IPFS as part of the default local integration stack. The API waits for database migrations and required infrastructure health checks. See [local Compose deployment](docs/deployment/local-compose.md). This topology has not been runtime-tested in the current build environment because Docker is unavailable; successful YAML parsing is not evidence of a successful deployment. Hyperledger Fabric remains an externally provisioned network.

## Integration and acceptance testing (v0.26.0)

The backend suite now includes acceptance coverage for the upload-to-public-verification boundary, including the quarantine publication gate, QR lookup privacy headers, organisation isolation and revocation. The full 13-scenario acceptance matrix and remaining integration/security gates are documented in [`docs/testing/acceptance-matrix.md`](docs/testing/acceptance-matrix.md).

Current local test command: `cd backend && pytest -q`. The latest verified result for this repository increment is **92 passed**. These tests use SQLite and mocked or fixture-based dependencies; they do not constitute live PostgreSQL, Celery, ClamAV, IPFS, Fabric, browser or production acceptance. The frontend dependency installation timed out, so its production build remains unverified.


## CI/CD and supply-chain checks (v0.29.0)

GitHub Actions checks backend tests, frontend typechecking/build, Fabric Go modules, Compose configuration, dependency and secret scanning, Trivy filesystem scanning, and CycloneDX source SBOM generation. See `docs/engineering/ci-cd-and-supply-chain.md` for implemented controls and remaining lockfile limitations.

## Observability and operational monitoring (v0.31.0)

The API emits structured JSON request logs with validated correlation IDs. Correlation IDs are propagated in Celery task headers and included in task lifecycle logs. `GET /metrics` exposes Prometheus request metrics, process uptime, Redis broker availability and the configured Celery queue's pending list length. `GET /health/dependencies` provides bounded-timeout reachability checks for configured PostgreSQL, Redis, ClamAV, IPFS and Fabric Gateway services; `/health` remains process liveness and `/ready` remains database readiness.

Prometheus and Grafana are optional local services. Set `GRAFANA_ADMIN_PASSWORD` in `.env`, then run `docker compose --profile monitoring up -d prometheus grafana`. Prometheus is available on loopback port 9090 and Grafana on loopback port 3000. Import `monitoring/grafana/gdi-vs-overview.json`; starter alert rules are in `monitoring/alerts/gdi-vs.yml`. Configure Alertmanager/contact points before relying on notifications. Restrict `/metrics` and diagnostic health endpoints to trusted networks in production. See [observability operations](docs/operations/observability.md).

**Observability verification:** backend suite **95 passed**; Python compilation, Compose YAML, Prometheus/alert YAML, Grafana dashboard JSON and ZIP integrity validated. Docker services, live Prometheus scraping, Grafana dashboard import, Redis queue probes and Celery task propagation were not run in this environment. Queue depth reports pending list messages only, not reserved or active tasks; no worker-side Prometheus exporter or distributed tracing backend is configured.


## Performance engineering (v0.31.0)

Repeatable HTTP and document-primitive benchmark tools, an optional k6 smoke profile, and query-index rationale are documented in [`docs/performance/performance-engineering.md`](docs/performance/performance-engineering.md). No production capacity claim is made until representative live infrastructure is measured.

## Personal Debug workspace

The project-owner-only `Debug/` folder contains convenience copies of the Workstream 41 synthetic dataset, benchmark, research note, generator, benchmark script and tests. It is not used by the application. The canonical editable files remain in `backend/`, `scripts/`, `data/`, `artifacts/` and `docs/ai/`. See [`Debug/README.md`](Debug/README.md).


## Workstream 44 — Visual tampering screening

The extraction pipeline now includes a bounded JPEG recompression-error screen that returns ranked candidate regions for human review. Non-JPEG formats explicitly report `NOT_APPLICABLE`. This is heuristic evidence only: it does not prove manipulation, identify an editing operation, or produce an authenticity verdict. See `docs/ai/workstream-44-visual-tampering-screening.md`.

## Multimodal feature contract (v0.50.0)

The extraction worker now emits a fixed-width multimodal feature record combining text/schema, layout/metadata, image-statistic and JPEG visual-screening feature families. Each family has an explicit availability flag. This is a versioned research input contract only: no multimodal model is trained, approved or deployed. The synthetic corpus remains limited to the original text/schema features and cannot validate multimodal performance.

## Reproducing on macOS 26.3 Tahoe

See [`docs/deployment/macos-26.3-tahoe.md`](docs/deployment/macos-26.3-tahoe.md). This is a runbook, not evidence of a completed Tahoe deployment.


## Workstream 62 — Real Fabric deployment and transaction acceptance (v0.59.0)

The repository now includes `blockchain/network/deploy-test-network.sh` for chaincode deployment through the official Fabric Samples test-network workflow and `blockchain/network/acceptance/real-ledger-acceptance.sh` for a live issuer-authorisation, document-registration, commit-wait, read-back and digest-verification sequence. These scripts require an independently provisioned Fabric network and correctly attributed CA identity. They are operator tooling, not evidence of a live transaction in this development environment. See [Workstream 62 acceptance guide](docs/verification/workstream-62-real-fabric-deployment-acceptance.md).


## Workstream 63 — Fabric acceptance evidence capture (v0.62.0)

The repository now includes `blockchain/network/acceptance/capture-ledger-evidence.sh`, which wraps the real peer-CLI acceptance flow, preserves its transcript, and emits a JSON manifest containing execution disposition, network/test context, transcript SHA-256 and any transaction IDs visible in the CLI output. Deterministic mock-peer checks validate success capture and failure propagation only; they do not constitute Fabric ledger acceptance. See [Workstream 63 evidence guide](docs/verification/workstream-63-fabric-acceptance-evidence.md).

## Workstream 65 — Dashboard & frontend architecture (v0.62.0)

The organisation workspace overview now includes API-derived document and issuer status distributions, recent document records, open review attention and direct navigation. The dashboard explicitly reports that figures describe only currently loaded organisation-scoped API records; unsupported hash, AI, Fabric and IPFS metrics are not fabricated. See `docs/frontend/workstream-65-dashboard-operational-summary.md`. The backend suite passed 204 tests; the frontend typecheck remains blocked because React dependencies are not installed in this environment.

## Workstream 69 — Downloadable verification reports (v0.66.0)

Verification History now supports organisation-scoped PDF reports generated from persisted evidence. Successful report generation is audited. The report separates trust dimensions and explicitly states its limitations. See `docs/reports/workstream-69-verification-report-pdf.md`.


## Workstream 71 — Reviewer assignment and case management (v0.68.0)

Adds organisation-scoped reviewer discovery, assignment/unassignment for active review cases, assignment filters (mine/unassigned/all), and audit events for ownership changes. Closed cases cannot be reassigned; assignees must be active reviewers in the same organisation. SLA timing and workload analytics are not implemented because no SLA policy or workload model is defined. See `docs/reviews/workstream-71-reviewer-assignment-case-management.md`.

## Workstream 72 — Reviewer workload, ageing and escalation visibility (v0.69.0)

Adds organisation-scoped reviewer workload counts, unassigned active-case counts, descriptive 24/72-hour ageing buckets, assignment-change history, and predecessor escalation lineage. The dashboard presents workload as operational context, not a reviewer performance score. Age buckets are not SLA breaches: no deadline is calculated because an organisation-approved SLA policy has not yet been configured. See `docs/reviews/workstream-72-reviewer-workload-and-escalation.md`.

### Workstream 73 — Reviewer workspace refinement (v0.70.0)

The reviewer case queue now provides text search, assignment/status/priority filters, chronological sorting, and responsive 12-item pagination. These controls operate client-side over the currently loaded case collection; server-side pagination remains future work. See `docs/frontend/workstream-73-reviewer-workspace-refinement.md` for validation and limitations.


## Workstream 74 — Application-wide frontend redesign (v0.71.0)

Introduces a consistent application shell with grouped Workspace and Governance navigation, clearer organisation and user identity, refined session controls, role-aware reviewer landing copy and a direct review-queue action. The visual system is consolidated through shared design tokens, improved spacing, surfaces, table treatment and focus states. The navigation collapses into a horizontally scrollable mobile bar, while the desktop sidebar remains persistent. Existing document, issuer, credential, public-link, verification-history and review workflows are retained. This is an incremental shell and experience redesign; it does not claim a separate reviewer route, server-side data pagination, or live infrastructure health monitoring. See `docs/frontend/workstream-74-application-wide-redesign.md`.

## v1.0 release programme — master technical audit

The v1.0 target is governed by the Workstream 75 source-based audit in `docs/audit/GDI-VS-v1.0-master-technical-audit.md`. The audit includes a 72-route API inventory, SQLAlchemy model inventory, frontend workspace inventory, key/trust-material inventory, integration acceptance assessment and a prioritised release gap register. The audit decision is **NOT READY FOR v1.0.0**; the current product baseline is advanced by subsequent workstreams; as of Workstream 84 it is v0.80.0. Required implementation and acceptance gates remain before v1.0.0. Static inventory is not production certification.

## Workstream 76 — Release metadata and reproducibility (v0.72.0)

The root `VERSION` file is the release version source of truth. Backend runtime metadata, backend package metadata, and frontend package metadata are aligned and checked by `make release-metadata-check`. Dependency lockfiles remain outstanding because registry resolution was unavailable in the development environment; no synthetic lockfiles were committed. See `docs/release/workstream-76-release-v0.72.0.md` and `docs/release/workstream-76-validation.md`.

### Workstream 77 — API contract and endpoint security audit (v0.73.0)

Added a reproducible source-level API security register covering 67 route declarations across the versioned API routers. Authentication classifications are explicit, and tenant-scope indicators are labelled as static heuristics rather than proof. Runtime cross-tenant tests, full OpenAPI contract acceptance, rate-limit validation and deployed `/metrics` network restriction remain release-gate items. Run `python scripts/audit-api-security.py` from the project root to regenerate the register.

### Workstream 78 — Identity, RBAC & Tenant Isolation (v0.74.0)

- Authenticated access now checks that the user's organisation remains active; login and refresh reject inactive organisations.
- Refresh rotation validates the token/session binding and locks the session row where supported.
- Added tenant and role regression coverage for issuer public-key endpoints.
- Added `scripts/audit-rbac-tenant.py` and `docs/audit/rbac-tenant-review-register.csv`.
- See `docs/security/workstream-78-identity-rbac-tenant-isolation.md` for implementation details and remaining v1.0 security gates.

### Workstream 79 — Cryptographic key management and trust lifecycle (v0.75.0)

JWT access and refresh tokens now carry a signing-key ID (`kid`), and the API can verify tokens against a configured multi-key keyring to support controlled secret rotation. The legacy `JWT_SECRET` mode remains supported. Issuer ECDSA public keys are restricted to NIST P-256/P-384/P-521. Key ownership, rotation procedure and trust limitations are documented in `docs/security/workstream-79-cryptographic-key-management.md`. Production KMS/HSM custody, versioned IPFS key rotation, OCSP/full RFC 5280 validation and Fabric identity rotation remain outstanding v1.0 gates.


### Workstream 80 — IPFS, Fabric & cross-system reliability (v0.76.0)

Adds a versioned IPFS AES-256-GCM keyring with per-object key IDs while retaining legacy single-key compatibility. The transactional outbox now uses row-level claim locking where supported, avoids immediate duplicate processing while a recent claim is active, schedules bounded exponential retry availability, and recovers stale processing rows after 15 minutes. Targeted IPFS, Fabric-client, outbox, release-metadata and verification-orchestration tests passed (45 tests). Live IPFS/Fabric acceptance, PostgreSQL concurrency acceptance, KMS/HSM custody and automatic IPFS object re-encryption remain outstanding. See `docs/storage/workstream-80-ipfs-fabric-reliability.md`.


### Workstream 81 — Document lifecycle and cross-system reconciliation (v0.77.0)

Adds `GET /api/v1/blockchain/documents/versions/{version_id}/reconcile`, a read-only report that checks the database digest, IPFS pin and encrypted object integrity, and Fabric ledger digest comparison. The report is organisation-scoped, does not repair or mutate any system, and only returns `CONSISTENT` when the digest, IPFS and Fabric checks all match. Missing resources, unavailable services and key/configuration failures remain explicit. Targeted tests passed (40 tests); live integration and PostgreSQL concurrency acceptance remain outstanding.

### v0.82.0 — Deployment readiness and integration acceptance

Workstream 85 adds a non-destructive deployment preflight (`python scripts/deployment-preflight.py`) that validates required environment secrets, IPFS encryption-key format, Python runtime and Docker Compose configuration without printing secret values. Use `--fabric` to require optional Fabric profile settings. After starting the stack, run `python scripts/acceptance-smoke.py --require-core-dependencies` for separate live API/dependency/worker/metrics/OpenAPI smoke checks. Neither command substitutes for the mandatory end-to-end acceptance scenarios or a real Fabric transaction test. See `docs/deployment/workstream-85-deployment-readiness.md`.


## Workstream 86 — Dependency Locking

Run `make dependency-lock-check` to verify npm, Python and Go lockfile presence before a release. See `docs/release/workstream-86-dependency-locking.md` for lockfile generation and CI policy.

## v0.83.0 — Dependency security and SBOM

Workstream 87 adds a deterministic CycloneDX 1.5 source-manifest SBOM covering declared npm, Python and Go dependencies. Generate it with `make source-sbom`. Manifest version ranges are not resolved dependency versions; the SBOM clearly records this limitation and does not imply a vulnerability assessment. CI publishes this inventory and an Anchore filesystem SBOM, while retaining configured package, secret and filesystem security scans. Missing registry-derived lockfiles remain a blocking release qualification item. See `docs/security/workstream-87-supply-chain-security.md` and `docs/release/workstream-87-release-v0.83.0.md`.


## v0.84.0 — Lockfile resolution workflow

Workstream 88 adds `make resolve-dependency-locks`, which invokes npm, uv and Go native tooling to generate authentic dependency lockfiles when registries are reachable. It never fabricates versions or integrity hashes. Run `make dependency-lock-check` afterwards and follow the clean-install and remediation procedure in `docs/security/workstream-88-lockfile-resolution.md`. Registry DNS was unavailable during this development release, so the four registry-derived lockfiles and vulnerability clearance remain outstanding.


## v0.86.0 — Dependency audit execution

Workstream 89 adds `make dependency-security-audit` and a machine-readable audit evidence report. The runner refuses to run ecosystem scanners until authentic npm, uv and all three Go module lockfiles exist; missing lockfiles and tools are reported as blocked, never clean. The lockfile gate now includes the evidence-verifier module. npm registry resolution timed out in this environment, so no resolved dependency audit or vulnerability clearance is claimed. See `docs/security/workstream-89-dependency-audit-execution.md` and `docs/release/workstream-89-release-v0.85.0.md`.


## Latest development release — v0.86.0

Workstream 90 introduces deterministic release packaging, SHA-256 checksums, a machine-readable provenance manifest, embedded/standalone Debug parity checks and a strict GitHub Actions release pipeline. The release remains development status until the five dependency lockfiles and full CI gates pass. See `docs/release/workstream-90-release-pipeline.md`.


## v0.88.0 — Dependency lockfile closure

Workstream 91 corrects the lockfile inventory: four resolved lockfiles are required (npm, uv, Fabric Gateway Go, and Fabric chaincode Go). The evidence-verifier currently uses only the Go standard library and is checked for that condition rather than being forced to carry an empty `go.sum`. `make dependency-lock-check` now validates lockfile structure and package identity; `make dependency-lock-check-json` emits machine-readable status. Registry DNS was unavailable during this development release, so all four generated lockfiles remain outstanding and the strict release gate remains blocked. See `docs/security/workstream-91-lockfile-closure.md`.

## Latest development release — v0.88.0

Workstream 91 strengthens lockfile validation, corrects the standard-library-only Go module inventory, and extends native lockfile resolution and JSON reporting. This release is not production-approved: clean dependency installations, vulnerability clearance and full production builds remain unverified.

## v0.89.0 — Backend test isolation

Workstream 93 adds `scripts/run-backend-tests-isolated.py`, which executes each backend test module in a fresh pytest process, applies bounded numerical-library thread settings, enforces per-module timeouts, and writes machine-readable execution evidence. `make backend-test` and the CI/release workflows use the same runner. See `docs/testing/workstream-93-backend-test-isolation.md`.

## v0.90.0 — Backend regression acceptance

Workstream 94 completed all 46 backend test modules in isolated fresh processes: 256 passed, zero failed, zero errors and zero timeouts. Execution was performed in bounded batches to fit the interactive execution window; per-module results are merged transparently in `artifacts/backend-test-isolation-v0.90.0.json`. The runner now persists a checkpoint report after each module. Four authentic dependency lockfiles remain missing, so clean installs, production builds, vulnerability clearance and live infrastructure acceptance remain outstanding. See `docs/testing/workstream-94-backend-regression-acceptance.md`.

## v0.91.0 — Bounded dependency lockfile resolution

Workstream 95 adds a bounded native resolver for npm, uv and Go lockfiles. It records per-ecosystem outcomes in `security/reports/lockfile-resolution-v0.91.0.json`, including blocked commands and diagnostic output. The initial npm resolution attempt timed out in this environment; no lockfiles were fabricated and all four lockfile gates remain outstanding. See `docs/security/workstream-95-lockfile-resolution.md`.


## v0.92.0 — Frontend source preflight

Workstream 96 corrects the locale date formatter's `string | Date` handling and adds `scripts/check-frontend-source.py` for offline frontend structure and TS/TSX syntax checks. Run `make frontend-source-check` or `cd frontend && npm run check:source`. This check is intentionally distinct from dependency-backed `npm run typecheck` and `npm run build`; those remain unverified because `frontend/package-lock.json` is missing and frontend dependencies are not installed. See `docs/frontend/workstream-96-frontend-source-preflight.md` and `docs/release/workstream-96-release-v0.92.0.md`.

## v0.93.0 — Frontend accessibility source audit

Workstream 97 adds a TypeScript AST-based JSX accessibility source audit. Run `make frontend-accessibility-audit` or `cd frontend && npm run audit:a11y`. The audit is wired into frontend CI and release workflow and currently reports zero static findings across the three frontend TSX/JSX files. This is not WCAG certification; browser and assistive-technology review remain outstanding. TypeScript semantic checking and Vite production bundling remain blocked by unavailable npm registry access and the missing npm lockfile. See `docs/frontend/workstream-97-accessibility-source-audit.md`.

## v0.96.0 — Production browser acceptance

Workstream 99 switches Playwright to Vite production preview, adds negative-authentication, locale-persistence and public-verification unavailable-state scenarios, and makes CI/release workflows build before browser execution. Local npm installation remains blocked by registry DNS (`EAI_AGAIN`), so TypeScript, production build and browser execution are not claimed. See `docs/testing/workstream-99-production-browser-acceptance.md`.
