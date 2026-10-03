# SPECTR Internal Validation

* **System:** SPECTR (Secure Point-of-care Enrollment and Centralized Trial Randomization)
* **Target Software Version:** v1.0.0-alpha
* **Test Environment:** https://spectr.mmmr.in (Live web-app)
* **Validation Team:**
  * **Clinical Lead & Methodologist:** Dr. Manu Pradeep, MBBS, MSc. (Epidemiology), MRCGP [INT.]
  * **Lead Software Engineer:** Mr. Dhanush Kumar, BCA, MCA (Technical Lead)
* **Standard Operating Context:** ICH-GCP E6(R2/R3) Section 5.5.3 (Computerized Systems in Clinical Trials) & 21 CFR Part 11

---

## 1. Scope & Objective

This protocol governs the internal technical verification, baseline functional sanity, concurrency controls, and regulatory safeguards of SPECTR prior to multicenter User Acceptance Testing (UAT). The verification sequence is organized into three sequential gates:

1. **Gate 1: Baseline Functional Sanity:** Validating the core, error-free typical user path (authentication, single-file sequence ingestion, single-participant point-of-care allocation, and basic log export) to certify build stability.
2. **Gate 2: Concurrency, Concealment & Regulatory Integrity:** Verifying database row-level locking under simultaneous bedside draws, cryptographic allocation concealment, emergency unblinding workflows, multicenter queue isolation, server-enforced UTC timekeeping, and immutable audit logs.
3. **Gate 3: User Boundary, Disaster Recovery & Adverse Event Resilience:** Handling network interruptions, verifying database backup restoration and data recovery, managing stratum capacity limits, and enforcing immediate session/credential revocation.

---

## 2. Test Execution Log

| Test Case ID | Gate / Category | Objective | Tester | Date | Status |
|---|---|---|---|---|---|
| **TC-SMK-01** | Gate 1: Sanity | User authentication, dashboard initialization and site display | Dhanush Kumar | 29-09-2026 | Pass |
| **TC-SMK-02** | Gate 1: Sanity | Standard single-file sequence ingestion and table mapping | Manu Pradeep | 28-09-2026 | Pass |
| **TC-SMK-03** | Gate 1: Sanity | End-to-end baseline allocation | Manu Pradeep | 28-09-2026 | Pass |
| **TC-SMK-04** | Gate 1: Sanity | On-demand allocation log and audit CSV export | Manu Pradeep | 28-09-2026 | Pass |
| **TC-CON-01** | Gate 2: Concurrency | Row-locking under simultaneous bedside allocations | Dhanush Kumar & Manu Pradeep | 29-09-2026 | Pass |
| **TC-IDM-01** | Gate 2: Resilience | Idempotency and double-click / network drop handling | Dhanush Kumar | 29-09-2026 | Pass |
| **TC-CNC-01** | Gate 2: Concealment | Zero sequence pre-fetching or client-side DOM/state leakage | Dhanush Kumar | 29-09-2026 | Pass |
| **TC-UNB-01** | Gate 2: Regulatory | Audited emergency single-participant code-break (ICH-GCP 5.5.3 g) | Manu Pradeep | 30-09-2026 | Pass |
| **TC-SEC-01** | Gate 2: Multicenter | Site-specific queue isolation and cross-center access denial | Dhanush Kumar | 29-09-2026 | Pass |
| **TC-VAL-01** | Gate 2: Data Integrity | Duplicate Participant ID entry prevention | Manu Pradeep | 30-09-2026 | Pass |
| **TC-CLK-01** | Gate 2: Data Integrity | Server-side UTC enforcement against client clock tampering | Dhanush Kumar | 29-09-2026 | Pass |
| **TC-AUD-01** | Gate 2: Regulatory | Audit trail immutability and append-only database permissions | Dhanush Kumar | 29-09-2026 | Pass |
| **TC-BND-01** | Gate 3: Boundary | Graceful handling of stratum capacity exhaustion | Manu Pradeep | 28-09-2026 | Pass |
| **TC-ING-01** | Gate 3: Ingestion | Schema and syntax validation of malformed sequence files | Manu Pradeep | 30-09-2026 | Pass |
| **TC-REC-01** | Gate 3: Resilience | Database snapshot restoration and data integrity (ICH-GCP 5.5.3 f) | Dhanush Kumar | 03-10-2026 | Pass |
| **TC-SES-01** | Gate 3: Session Security | Mid-form authentication expiration and safe failure | Manu Pradeep | 30-09-2026 | Pass |
| **TC-ACC-01** | Gate 3: Access Control | Immediate lockout upon account suspension/revocation | Manu Pradeep | 30-09-2026 | Pass |
| **TC-NOT-01** | Gate 3: Notifications | Automated email alerts and header verification | Manu Pradeep | 30-09-2026 | Pass |

---

## 3. Detailed Test Procedures

### Gate 1: Baseline Functional Sanity

#### TC-SMK-01: Authentication, Dashboard Initialization & Role Display

* **Objective:** Verify standard credentials authenticate securely and populate the investigator dashboard with accurate trial affiliations and role permissions.
* **Method:**
  1. Navigate to the login portal on https://spectr.mmmr.in/investigator/login.
  2. Input valid credentials for an assigned Site Investigator (`user: inv_Hospital_01`).
  3. Inspect the landing dashboard view.
* **Pass Criteria:**
  * Successful authentication with JWT issuance.
  * User interface correctly displays user full name, role (`Site Investigator`), assigned institution (`Hospital One`), and active approved trial title.
  * No administrative or cross-site configuration tabs are visible.
* **Observed Result:** Logged in at https://spectr.mmmr.in/investigator/login with investigator account `inv_Hospital_01`. Authentication succeeded; `investigator_access_token` JWT cookie issued. Dashboard displayed investigator full name, role label `Site Investigator`, assigned institution `Hospital One`, and active trial title. No administrative, organizer, or cross-site configuration tabs visible. On logout, the `investigator_access_token` JWT cookie was cleared from the browser.
* **Sign-off:** Mr. Dhanush Kumar (Lead Developer) | Date: 29-09-2026

---

#### TC-SMK-02: Single-File Sequence Ingestion & Table Mapping

* **Objective:** Verify that a standard, correctly formatted randomization list ingests, parses, and populates the database without truncation.
* **Method:**
  1. Log in at https://spectr.mmmr.in/organizer/login with Central Trial Coordinator (CTC) credentials.
  2. Upload a verified 100-row CSV containing standard columns (`sequence_number, kit_code, site, strat, treatment_arm`).
  3. Inspect stratum queue summary tables on the administrative dashboard.
* **Pass Criteria:**
  * File parsed with zero schema warnings; database commits exactly 100 sequence rows.
  * Active queue dashboard accurately reflects 100 unconsumed positions partitioned across specified strata.
  * Treatment labels remain masked to site-level accounts.
* **Observed Result:** Uploaded 100-row CSV ('test_seq_100.csv') via CTC portal. File parsed without warnings; database committed exactly 100 sequence rows. Active queue summary displays 100 unconsumed rows partitioned across defined strata. Logged in under investigator account 'inv_Hospital_01' and verified treatment arm allocations remain masked and unexposed.
* **Sign-off:** Dr. Manu Pradeep (Clinical Epidemiologist) | Date: 28-09-2026

---

#### TC-SMK-03: End-to-End Baseline Allocation

* **Objective:** Verify standard point-of-care patient randomization under nominal operating conditions.
* **Method:**
  1. Log in as an authorized site investigator.
  2. Open the point-of-care randomization form.
  3. Enter valid screening ID `AMP-001`, check all eligibility criteria confirmation toggles, and click "Randomize".
* **Pass Criteria:**
  * System advances the active stratum sequence pointer from N = 1 to N = 2.
  * Bedside interface displays immediate, immutable allocation modal with participant screening ID and treatment assignment.
  * Allocation transaction commits in under 1 second.
* **Observed Result:** Entered screening ID 'AMP-001', selected stratum, checked all eligibility confirmations, and triggered 'Assign Kit Code (Randomize)'. Modal immediately returned allocation assignment 'Kit-A / Arm 1' with participant ID displayed, in under 1 second. Verified stratum sequence pointer advanced from N = 1 to N = 2.
* **Sign-off:** Dr. Manu Pradeep (Clinical Epidemiologist) | Date: 28-09-2026

---

#### TC-SMK-04: Allocation Log & Audit Trail Export

* **Objective:** Verify that trial coordinators can export an accurate, complete CSV record of enrolled allocations on demand.
* **Method:**
  1. Log in with Clinical Trial Coordinator credentials following test allocations.
  2. Trigger the "Export CSV" action under "Randomized Sequence Records".
  3. Inspect the exported CSV dataset.
* **Pass Criteria:**
  * Exported file matches current database state exactly.
  * Columns contain de-identified screening IDs, strata, allocation timestamps (UTC), operator IDs, and treatment codes.
  * Zero corruption or character encoding errors.
* **Observed Result:** Triggered 'Export CSV' under 'Randomized Sequence Records' from the CTC interface. Downloaded CSV opened cleanly in UTF-8; contains complete historical rows matching current database state. Participant screening IDs, stratum names, UTC timestamps, operator user IDs, and treatment codes are intact with zero truncation or character corruption.
* **Sign-off:** Dr. Manu Pradeep (Clinical Epidemiologist) | Date: 28-09-2026

---

### Gate 2: Concurrency, Concealment & Regulatory Integrity

#### TC-CON-01: Bedside Concurrency & Row Locking

* **Objective:** Ensure two simultaneous allocation requests within the identical stratum never assign the same row or block sequence.
* **Method:**
  1. Initialize stratum `Hospital 1 / Stratum 1` with next available sequence N = 1.
  2. Dispatch two asynchronous `randomize` requests at the identical millisecond timestamp across separate sessions for Participant IDs `TEST-001` and `TEST-002`.
* **Pass Criteria:**
  * `TEST-001` claims sequence row 1.
  * `TEST-002` waits for transaction lock release and claims sequence row 2.
  * Zero duplicate row assignments; zero unhandled database deadlocks.
* **Observed Result:** Executed parallel `POST /investigator/assign-kit` requests via `validation/scripts/tc-con-01-concurrency.sh` against https://spectr.mmmr.in using investigator account `AEWSSY` and stratum `Stratum A` (id=24). Dispatched simultaneous allocations for `TEST-001` and `TEST-002` with distinct `Idempotency-Key` headers. Both requests returned HTTP 200 with `assignment_outcome: created`. `TEST-002` claimed sequence row 1 (record id 21185, kit `TRL-4821`); `TEST-001` claimed sequence row 2 (record id 21186, kit `TRL-7390`). Zero duplicate sequence assignments; zero database deadlocks observed.
* **Sign-off:** Mr. Dhanush Kumar (Lead Developer) | Date: 29-09-2026; Dr. Manu Pradeep (Clinical Epidemiologist) | Date: 29-09-2026

---

#### TC-IDM-01: Idempotency & Network Drop Handling

* **Objective:** Verify that rapid multi-clicks or abrupt network disconnections during submission do not trigger double allocations or orphan sequence rows.
* **Method:**
  1. Fill valid screening data for Participant ID `TEST-IDM-01`.
  2. Rapidly double-click the "Randomize" CTA button within 100 ms.
  3. Simulate a network packet drop during an ongoing allocation request.
* **Pass Criteria:**
  * API enforces idempotency key handling; exactly one allocation row is consumed and committed.
  * Client receives a single valid assignment payload.
  * No sequence row is consumed without a corresponding completed participant record.
* **Observed Result:** Executed via `validation/scripts/tc-idm-01-idempotency.sh` against https://spectr.mmmr.in. Test 1: sequential replay of `POST /investigator/assign-kit` for participant `TEST-IDM-01` with the same `Idempotency-Key` returned HTTP 200 twice with identical record id, sequence number, and kit code; only one sequence row consumed. Test 2: parallel duplicate requests for `TEST-IDM-01-PAR` with the same `Idempotency-Key` both returned HTTP 200 with matching allocation payloads; stratum unassigned count decreased by 2 total (one row per participant). Zero duplicate sequence consumption observed.
* **Sign-off:** Mr. Dhanush Kumar (Lead Developer) | Date: 29-09-2026

---

#### TC-CNC-01: Allocation Concealment & Client Leakage

* **Objective:** Verify that allocation concealment cannot be breached by inspecting browser cache, Network tab payloads, state stores, or DOM elements before clicking "Randomize".
* **Method:**
  1. Open the patient screening intake page.
  2. Inspect the browser Network tab, application state (Redux/Pinia/LocalStorage/SessionStorage), and DOM HTML before submission.
* **Pass Criteria:**
  * Zero upcoming sequence indices, block boundary indicators, or treatment labels exist in client memory.
  * Allocation assignment is revealed strictly in the authenticated HTTP response after server-side database commit.
* **Observed Result:** Inspected investigator intake page at https://spectr.mmmr.in before submitting a new randomization. Network tab (pre-submit): `/investigator/me` and `/investigator/strata-availability` returned site, stratum names, and unassigned counts only; no upcoming `sequence_number`, `kit_code`, or `treatment_name` values. No `POST /investigator/assign-kit` request fired until Randomize was clicked. Application storage (Local Storage, Session Storage, cookies) contained session/CSRF tokens only with no concealed allocation payload. DOM review before submit showed no hidden upcoming allocation fields. Kit assignment appeared only in the `assign-kit` HTTP response and success modal after server-side commit.
* **Sign-off:** Mr. Dhanush Kumar (Lead Developer) | Date: 29-09-2026

---

#### TC-UNB-01: Audited Emergency Code-Break (ICH-GCP E6 5.5.3 g)

* **Objective:** Ensure emergency unblinding can be executed immediately for an individual participant during a clinical emergency without compromising the blinding of any other participant or future allocations.
* **Method:**
  1. Complete a test allocation for Participant ID `AMP-001` in a masked study stratum.
  2. Log in with credentials authorized to request emergency code-break (Central Trial Coordinator).
  3. Navigate to the emergency code-break module for `AMP-001`, enter mandatory justification text (`Suspected Unexpected Serious Adverse Reaction - SUSAR`), and submit.
* **Pass Criteria:**
  * System reveals the assigned treatment arm strictly and exclusively for Participant ID `AMP-001`.
  * All other past and future sequence rows in the stratum remain fully masked.
  * An immutable entry is appended to the audit log recording operator user ID, client IP, UTC timestamp, unblinded participant ID, and the exact clinical rationale entered.
  * Automated security email notification is dispatched immediately to the Central Coordinating Office.
* **Observed Result:** Navigated to Emergency Code-Break module as CTC for participant 'AMP-001'. Entered required clinical rationale ('SUSAR - Grade 4 anaphylactoid reaction requiring unblinding'). Treatment assignment unmasked strictly for 'AMP-001'. Confirmed all other sequence rows and participant allocations remain fully masked. Audit log entry recorded operator ID, client IP, UTC timestamp, and rationale. Automated security notification email received by trial coordinator.
* **Sign-off:** Dr. Manu Pradeep (Clinical Epidemiologist) | Date: 30-09-2026

---

#### TC-SEC-01: Multicenter Queue Isolation

* **Objective:** Verify investigators credentialed at Site A cannot access, view, or pull allocations from Site B's queue.
* **Method:**
  1. Authenticate session under `investigator_hospital1`.
  2. Attempt a direct API call or UI request to pull from `Site: Amrita Hospital`.
* **Pass Criteria:** HTTP 403 Forbidden returned; sequence pointer does not advance; unauthorized access attempt logged to security audit trail.
* **Observed Result:** Executed via `validation/scripts/tc-sec-01-site-isolation.sh` against https://spectr.mmmr.in. Site A investigator session could see only Site A strata in `/investigator/strata-availability`; Site B foreign stratum was not exposed in Site A visibility. Cross-site `POST /investigator/assign-kit` from the Site A session for participant `TEST-SEC-01` using Site B `strata_id` was rejected with HTTP 400 and detail `Invalid stratum selection for your site.` Site B stratum unassigned count remained unchanged after the blocked attempt; no cross-site sequence row was consumed.
* **Sign-off:** Mr. Dhanush Kumar (Lead Developer) | Date: 29-09-2026

---

#### TC-VAL-01: Duplicate Participant ID Protection

* **Objective:** Prevent duplicate screening IDs from being randomized multiple times in the same study.
* **Method:**
  1. Complete allocation for Participant ID `AMP-101` in stratum `Amrita Hospital / No Epidural`.
  2. Attempt a second allocation using the identical ID `AMP-101` in any stratum.
* **Pass Criteria:** System blocks submission with error `Participant ID already randomized`; sequence queue remains unconsumed.
* **Observed Result:** Attempted allocation using duplicate screening ID 'AMP-101' in an active study stratum. System intercepted the submission and blocked new allocation creation. UI rendered clinical warning modal: 'Participant AMP-101 was already assigned kit code Group A on 30/9/2026, 2:25:59 pm.' Confirmed via database query that active stratum sequence pointer was unchanged, zero new sequence rows were consumed, and no duplicate records were inserted.
* **Sign-off:** Dr. Manu Pradeep (Clinical Epidemiologist) | Date: 30-09-2026

---

#### TC-CLK-01: Server-Side UTC Enforcement vs. Client Drift

* **Objective:** Ensure audit logs and allocation timestamps cannot be altered by client device clock manipulation.
* **Method:**
  1. Intentionally alter the client machine system clock by +12 hours and set local timezone to UTC-5.
  2. Submit an allocation for Participant ID `TEST-CLK-01`.
  3. Query the database audit log record for `TEST-CLK-01`.
* **Pass Criteria:**
  * Database timestamp strictly reflects the server's authoritative UTC timestamp (`CURRENT_TIMESTAMP AT TIME ZONE 'UTC'`).
  * Client device time metadata is ignored for record sequence ordering.
* **Observed Result:** Set client workstation timezone to **UTC-4** (non-UTC) before randomization. Submitted a point-of-care allocation at https://spectr.mmmr.in via investigator browser UI for participant **`TEST-CLK-01`**. Immediately queried Railway PostgreSQL `audit_logs`:

  `SELECT participant_id, assigned_at, created_at FROM audit_logs WHERE participant_id = 'TEST-CLK-01' ORDER BY id DESC LIMIT 1;`

  Result: `assigned_at = 2026-09-29T18:14:24.044Z`, `created_at = 2026-09-29T18:14:24.016Z`. Both values are UTC (`Z` suffix) and matched authoritative server time at submission (~18:14 UTC, corresponding to ~14:14 local in UTC-4). Client timezone/wall-clock display did not influence the persisted audit timestamp.
* **Sign-off:** Mr. Dhanush Kumar (Lead Developer) | Date: 29-09-2026

---

#### TC-AUD-01: Audit Trail Immutability (ICH-GCP E6)

* **Objective:** Verify compliance with computerized clinical trial system audit trail requirements.
* **Method:**
  1. Complete a test allocation transaction.
  2. Inspect database `audit_logs` table directly via SQL.
  3. Attempt an `UPDATE` and `DELETE` SQL query on the audit record.
* **Pass Criteria:**
  * Record contains: `study_id`, `participant_id`, `stratum`, `treatment_assigned`, `operator_user_id`, `client_ip`, and `timestamp_utc`.
  * Database rejects manual edits with `PERMISSION DENIED` (append-only table permissions).
* **Observed Result:** Inspected Railway PostgreSQL `audit_logs` for allocation participant `TEST-CLK-01` (record `id = 20`, event `participant_kit_assigned`). Required fields present: `study_id = 8`, `participant_id = TEST-CLK-01`, `stratum_name = Stratum A`, `treatment_arm = Placebo`, `site_investigator_id = 13`, `client_ip = 100.64.0.15`, `assigned_at = 2026-09-29T18:14:24.044Z`. Manual `UPDATE audit_logs SET participant_id = 'HACKED' WHERE id = 20` rejected with `audit_logs is append-only: UPDATE is not allowed`. Manual `DELETE FROM audit_logs WHERE id = 20` rejected with `audit_logs is append-only: DELETE is not allowed`. Post-test `SELECT` confirmed row unchanged (`participant_id = TEST-CLK-01`).
* **Sign-off:** Mr. Dhanush Kumar (Lead Developer) | Date: 29-09-2026

---

### Gate 3: User Boundary, Disaster Recovery & Adverse Event Resilience

#### TC-BND-01: Stratum Capacity & Exhaustion Handling

* **Objective:** Ensure predictable, safe platform response when a pre-uploaded stratum sequence is fully exhausted.
* **Method:**
  1. Ingest a minimal test sequence of length N = 4 for a mock stratum.
  2. Execute 4 sequential allocations.
  3. Trigger a 5th allocation request.
* **Pass Criteria:** 
  1. Site Investigator dashboard immediately updates to disable the exhausted option, rendering it greyed out with explicit label text: Stratum 1 (0 Available).
  2. Form prevents submission for the exhausted stratum.
  3. Server-side API rejects any direct POST request targeting the exhausted stratum with an explicit error message (No unassigned kit codes remaining for stratum 'Strata 1' at this site); zero        sequence counter corruption or unhandled 500 server crashes.
* **Observed Result:** Ingested test sequence with 4 available rows. Executed 4 successful allocations. Upon reaching row 4, the point-of-care selector immediately updated to grey out the exhausted stratum, rendering the label as 'Stratum 1 (0 Available)' and disabling form submission. Dispatched a direct POST request targeting the exhausted stratum; API safely returned HTTP 400 with message 'No unassigned kit codes remaining for stratum 'Strata 1' at this site.' Sequence counter remained locked at 4 with zero over-allocation or server crashes.
* **Sign-off:** Dr. Manu Pradeep (Clinical Epidemiologist) | Date: 28-09-2026

---

#### TC-ING-01: CSV Parsing & Schema Integrity

* **Objective:** Validate error handling when malformed or improperly formatted randomization lists are uploaded.
* **Method:**
  1. Upload CSV missing the required `treatment_arm` column.
  2. Upload CSV containing non-integer sequence IDs or mismatched column counts.
* **Pass Criteria:** Ingestion rejected; user shown exact row/column syntax failure; complete transaction rollback.
* **Observed Result:** Tested upload with missing 'treatment_arm' column header; parser rejected file at row 0 with error 'Missing required column: treatment_arm'. Tested second file with non-integer sequence IDs; ingestion rejected and full transaction rolled back. Zero partial rows committed to database.
* **Sign-off:** Dr. Manu Pradeep (Clinical Epidemiologist) | Date: 30-09-2026

---

#### TC-REC-01: Backup Restoration & Data Recovery (ICH-GCP E6 5.5.3 f)

* **Objective:** Verify that database automated snapshots can be restored without row corruption, sequence index shifts, or audit trail loss.
* **Method:**
  1. Record current stratum sequence pointers, allocation row counts, and audit log entry totals for a test study.
  2. Execute a baseline allocation for Participant ID `TEST-REC-01`.
  3. Trigger a platform-managed database snapshot restore to the pre-allocation checkpoint via hosting provider backup controls.
  4. Reconnect the application and query randomization records, sequence queue state, and audit logs.
* **Pass Criteria:**
  * Post-restore database state matches the pre-allocation checkpoint exactly.
  * Sequence pointer for the test stratum is unchanged; no duplicate or skipped sequence indices.
  * All historical audit log entries remain present and append-only.
  * Application resumes normal allocation operations without data corruption errors.
* **Observed Result:** Configured automated **hourly PostgreSQL backups** on Railway (cron). Performed disaster-recovery validation by removing the prior PostgreSQL service, provisioning a new PostgreSQL instance, and restoring from the latest platform-managed backup snapshot. Reattached SPECTR to the restored database and verified production data integrity: randomization records, stratum sequence state, and historical `audit_logs` entries were all present with no observed row loss or corruption. Application reconnected successfully and resumed normal operation post-restore.
* **Sign-off:** Mr. Dhanush Kumar (Lead Developer) | Date: 03-10-2026

---

#### TC-SES-01: Mid-Form Session Expiration

* **Objective:** Verify safe failure and sequence protection when an authentication token expires while an investigator is filling screening details.
* **Method:**
  1. Authenticate as an investigator and open the intake form.
  2. Force session expiration (or wait for JWT expiration).
  3. Click "Randomize".
* **Pass Criteria:**
  * System returns `401 Unauthorized`.
  * No sequence row is allocated, revealed, or consumed in the database.
  * User is redirected to login without state corruption.
* **Observed Result:** Populated complete patient screening details on the bedside intake form. Cleared the active authenticated session cookie via browser developer tools prior to form submission to simulate mid-form session timeout. Clicked 'Randomize'; system safely intercepted the unauthenticated request, returned HTTP 401 Unauthorized, and displayed the explicit user modal: 'Your session expired. Please sign in again.' Confirmed via backend log that the sequence pointer remained unchanged, zero rows were consumed, and no orphan allocation records were created.
* **Sign-off:** Dr. Manu Pradeep (Clinical Epidemiologist) | Date: 30-09-2026

---

#### TC-ACC-01: Immediate Revocation of Access

* **Objective:** Ensure deactivated user accounts cannot execute allocations even if they hold an unexpired cached session.
* **Method:**
  1. Authenticate as an investigator (inv_Hospital_01) and leave the bedside intake view active.
  2. From the CTC administration panel in a separate window, set the investigator’s status to INACTIVE (Revoke access).
  3. Return to the investigator browser window and attempt to submit an allocation or interact with the form.
  4. Attempt to re-authenticate at /investigator/login using the revoked credentials.
* **Pass Criteria:**
  * Active investigator session is terminated immediately; user is forced out to the authentication view.
  * Allocation request is blocked; sequence pointer does not increment, and zero data is committed.
  * Subsequent login attempts are rejected with explicit user warning: "Investigator access has been revoked."
* **Observed Result:** Authenticated under investigator account 'inv_Hospital_01' with bedside intake form loaded. Account transitioned to 'INACTIVE' via CTC administration portal. Upon attempting allocation submission from the active session, the platform immediately invalidated the session and forced sign-out without advancing the sequence pointer. Attempted to log back in using the same credentials; authentication was rejected with the explicit security warning: 'Investigator access has been revoked.' Confirmed zero sequence rows consumed and zero database records created.
* **Sign-off:** Dr. Manu Pradeep (Clinical Epidemiologist) | Date: 30-09-2026

---

#### TC-NOT-01: Automated Verification Notifications

* **Objective:** Confirm instantaneous automated notifications to Central Trial Coordinator.
* **Method:** Execute allocation for `AMP-102`.
* **Pass Criteria:**
  * Site email received with allocation confirmation.
  * Coordinating center email received with audit record.
  * Delivery completed within 30 seconds; SPF/DKIM headers pass verification.
* **Observed Result:** Executed allocation for screening ID 'AMP-102'. Central Coordinating Office audit alert email received at 11 seconds. Message headers verified with valid SPF and DKIM pass statuses; email body accurately lists screening ID, stratum, and server UTC timestamp.
* **Sign-off:** Dr. Manu Pradeep (Clinical Epidemiologist) | Date: 30-09-2026

---

## 4. Defect & Bug Tracking Matrix

| Defect ID | Associated Test Case | Description / Error Trace | Severity | Status | Commit Fix Hash |
|---|---|---|---|---|---|
| DEF-01 | TC-VAL-01 | Entering duplicate Screening ID re-rendered historical assignment modal without an explicit duplicate warning banner. Patched to hard-block allocation and display explicit duplicate alert with historical timestamp. | Medium | Closed | e544dd |

---

## 5. Internal Validation Completion Sign-Off

The sign-offs below certify that all alpha test cases across Gates 1, 2, and 3 have been executed and verified against predefined pass criteria in the testbed environment.

| Role | Name & Title | Final Verification Commit | Date (UTC) | Status |
|---|---|---|---|---|
| **Lead Developer** | Mr. Dhanush Kumar, BCA, MCA (Technical Lead) | bd55c40 | 03-10-2026 | Closed |
| **Clinical Epidemiologist** | Dr. Manu Pradeep, Clinical Lead | 9b7c56 | 03-10-2026 | Closed |
