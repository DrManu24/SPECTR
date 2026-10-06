import { Link } from 'react-router-dom'

const SUPPORT_EMAIL = 'mmmedicalresearch@outlook.com'
const INVESTIGATOR_LOGIN = 'https://spectr.mmmr.in/investigator/login'
const ORGANIZER_LOGIN = 'https://spectr.mmmr.in/organizer/login'

function UserGuideContent() {
  return (
    <article className="landing">
      <header className="landing__hero">
        <div className="landing__hero-head">
          <Link className="btn-secondary landing__back-home" to="/">
            Back to Home
          </Link>
          <h1 className="landing__title">SPECTR&trade;: User Guide</h1>
        </div>
        <div className="user-guide__intro">
          <p><strong>Document ID:</strong> SOP-SPECTR-001</p>
          <p><strong>Version:</strong> 1.0</p>
          <p><strong>Effective Date:</strong> October 1, 2026</p>
          <p>
            <strong>System:</strong> SPECTR (Secure Point-of-care Enrollment &amp; Centralized Trial
            Randomization)
          </p>
          <p>
            <strong>Regulatory Alignment:</strong> ICH-GCP E6(R2/R3) Section 5.5.3, US FDA 21 CFR
            Part 11
          </p>
        </div>
      </header>

      <section className="landing__section">
        <h2>1. Purpose &amp; Core Governance Rules</h2>
        <p>
          SPECTR is a validated, point-of-care web application designed to deliver cryptographically
          secure, randomized trial allocations directly at the clinical bedside while maintaining
          strict allocation concealment and tamper-evident audit trails.
        </p>
        <p><strong>Fundamental Rules:</strong></p>
        <ul className="landing__list">
          <li>
            <strong>Principal Investigator Oversight:</strong> The Principal Investigator (PI) retains
            ultimate ethical and regulatory accountability for protocol adherence, eligibility
            verification, and correct intervention allocation at their study site.
          </li>
          <li>
            <strong>Zero-PHI Policy (Strictly Enforced):</strong> Never enter patient names, national
            identification numbers, hospital record numbers, phone numbers, or dates of birth.
            Transact exclusively using protocol-authorized Participant Screening IDs (e.g., AMP-001).
          </li>
          <li>
            <strong>Access Integrity &amp; Non-Repudiation:</strong> User accounts and passwords must
            never be shared. Every transaction—allocation, unblinding, or export—is cryptographically
            recorded with a UTC timestamp and bound to the authenticated user ID.
          </li>
        </ul>
      </section>

      <section className="landing__section">
        <h2>2. System Roles &amp; Responsibilities</h2>
        <ul className="landing__list">
          <li>
            <strong>Study Investigator (SI):</strong> Bedside clinician, fellow, or research
            coordinator who verifies trial eligibility, records informed consent confirmation, and
            executes point-of-care participant allocation.
          </li>
          <li>
            <strong>Central Trial Coordinator (CTC):</strong> Clinical epidemiologist, data manager,
            or trial statistician who creates trial workspaces, manages strata, uploads allocation
            schedules, provisions site accounts, and monitors blinded/unblinded datasets.
          </li>
          <li>
            <strong>System Administrator:</strong> MM Medical Research team managing hosting
            infrastructure, encrypted database snapshots, security patching, and platform availability.
          </li>
        </ul>
      </section>

      <section className="landing__section">
        <h2>3. Site Investigator Instructions (Bedside Allocation Workflow)</h2>

        <div className="landing__capability">
          <h3>Step 1: Verify Pre-conditions Before Allocation</h3>
          <ul className="landing__list">
            <li>
              Confirm the participant (or legally authorized representative) has signed and dated the
              approved Institutional Ethics Committee (IEC/IRB) Informed Consent Form.
            </li>
            <li>
              Confirm all protocol inclusion criteria are fulfilled and no exclusion criteria are
              present in source records.
            </li>
            <li>Verify the assigned Participant Screening ID (e.g., AMP-001).</li>
          </ul>
        </div>

        <div className="landing__capability">
          <h3>Step 2: Log In &amp; Verify Site Context</h3>
          <ul className="landing__list">
            <li>
              Open your browser and navigate to:{' '}
              <a href={INVESTIGATOR_LOGIN} target="_blank" rel="noopener noreferrer">
                {INVESTIGATOR_LOGIN}
              </a>
            </li>
            <li>Log in using your assigned credentials (sent from noreply@mmmr.in).</li>
            <li>
              Inspect the header dashboard to ensure your assigned trial name and hospital site
              correspond to your clinical location.
            </li>
          </ul>
        </div>

        <div className="landing__capability">
          <h3>Step 3: Execute Random Allocation</h3>
          <ul className="landing__list">
            <li>
              <strong>Enter the Participant Screening ID:</strong> Enter the ID precisely. Note:
              SPECTR checks for duplicate allocations; however, typographical variations (e.g.,
              unintended spaces or altered casing) risk creating distinct records. Follow the exact
              protocol naming convention.
            </li>
            <li>
              <strong>Select Study Stratum:</strong> Choose the applicable stratum (e.g., Age ≥ 60 or
              Age &lt; 60; or Site Name).
              <ul className="landing__list">
                <li>
                  <strong>Important:</strong> If a stratum has reached its target recruitment
                  capacity, it will appear greyed out with the label &quot;(0 Available)&quot; and
                  will block selection.
                </li>
              </ul>
            </li>
            <li>
              <strong>Attest Eligibility:</strong> Review and check each required inclusion/exclusion
              attestation checkbox.
            </li>
            <li>
              <strong>Submit:</strong> Click the &quot;Randomize&quot; button once. Do not
              double-click or refresh the browser while the cryptographic allocation processes.
            </li>
          </ul>
        </div>

        <div className="landing__capability">
          <h3>Step 4: Record &amp; Confirm the Allocation</h3>
          <ul className="landing__list">
            <li>
              An allocation modal will instantly appear on-screen displaying the assigned
              intervention arm (open-label) or blinded kit code (blinded trial), along with the
              authoritative server UTC timestamp.
            </li>
            <li>
              Immediately transcribe the assigned kit code and allocation timestamp into the physical
              patient source chart and the Site Enrollment Log.
              <ul className="landing__list">
                <li>
                  <strong>Note on Notifications:</strong> To preserve transactional system resources,
                  routine allocation confirmation emails are not sent to bedside investigators. Your
                  allocation record is contemporaneously logged in the database and immediately
                  accessible in the Site Participant Records table at the bottom of your dashboard.
                </li>
              </ul>
            </li>
            <li>
              To download a copy of your site&apos;s enrollment audit trail at any time, click{' '}
              <strong>Export Site Participant Records</strong>.
            </li>
          </ul>
        </div>

        <div className="landing__capability">
          <h3>Emergency Code-Break (Unblinding Protocol)</h3>
          <p>
            Emergency unblinding must be invoked only when immediate identification of the
            investigational product is essential for medical management (e.g., a Suspected Unexpected
            Serious Adverse Reaction - SUSAR), and provided this option was authorized in the trial
            configuration.
          </p>
          <ol className="landing__steps">
            <li>
              The Site Investigator consults the Medical Monitor or Data Safety and Monitoring Board
              (DSMB) per trial protocol.
            </li>
            <li>
              Upon authorization, the SI navigates to the Site Participant Records table on the
              dashboard.
            </li>
            <li>
              Locate the row containing the subject&apos;s Participant Screening ID and click the{' '}
              <strong>Unblind</strong> button located under the Intervention Arm column.
            </li>
            <li>
              In the Emergency Unblinding Notice modal, input the mandatory clinical justification
              (e.g., &quot;SUSAR - Grade 4 anaphylactic reaction requiring treatment
              identification&quot;).
            </li>
            <li>Click <strong>Confirm Unblind</strong>.</li>
            <li>
              The interface unmasks the assignment exclusively for that individual subject. All other
              study allocations remain strictly concealed.
            </li>
            <li>
              An automated unblinding email alert is immediately dispatched to the CTC, and an
              immutable log entry (capturing operator ID, timestamp, and clinical justification) is
              permanently recorded in the audit trail.
            </li>
          </ol>
        </div>
      </section>

      <section className="landing__section">
        <h2>4. Central Trial Coordinator Instructions (Setup &amp; Management)</h2>

        <div className="landing__capability">
          <h3>Step 1: Creating a New Study Workspace</h3>
          <ol className="landing__steps">
            <li>
              Log in at{' '}
              <a href={ORGANIZER_LOGIN} target="_blank" rel="noopener noreferrer">
                {ORGANIZER_LOGIN}
              </a>
              .
            </li>
            <li>Click <strong>+ Create New Study</strong> on the CTC Dashboard.</li>
            <li>
              <strong>Input Trial Metadata:</strong> Study title/acronym, and the Clinical Trial
              Registry Identifier (CTRI, ClinicalTrials.gov, or ISRCTN number).
            </li>
            <li>
              <strong>Select Blinding Architecture:</strong>
              <ul className="landing__list">
                <li>
                  <strong>Open-Label:</strong> All trial parties can view the allocated intervention
                  arm.
                </li>
                <li>
                  <strong>Participant Blinding (PB):</strong> The allocating SI views the assigned
                  intervention, with an explicit advisory not to disclose the allocation to the
                  patient.
                </li>
                <li>
                  <strong>Participant and Investigator Blinding (PIB):</strong> The allocating SI
                  receives only an alphanumeric blinded kit code; intervention arms remain masked
                  unless an emergency unblinding occurs.
                </li>
                <li>
                  <strong>Participant, Investigator, and Statistician Blinding (PISB):</strong>{' '}
                  Complete four-way blinding. In addition to PIB mechanics, the data export CSV
                  transforms treatment arms into generic placeholders (e.g., &quot;Arm 1&quot;,
                  &quot;Arm 2&quot;) for masked interim analyses.
                </li>
              </ul>
            </li>
            <li><strong>Study Description:</strong> Enter a study overview.</li>
            <li>
              <strong>Emergency Unblinding Configuration:</strong> Check{' '}
              <strong>Emergency Unblinding Allowed</strong> if site investigators are authorized to
              unblind individual subjects during acute medical emergencies.
            </li>
            <li>
              <strong>Inclusion/Exclusion Criteria:</strong> Enter the protocol-mandated eligibility
              criteria (or insert a link to your registered protocol). These statements will be
              presented as mandatory attestation checkboxes to the SI prior to allocation.
            </li>
            <li>
              Click <strong>Create Study</strong>. The trial is initialized in Draft status.
            </li>
          </ol>
        </div>

        <div className="landing__capability">
          <h3>Step 2: Uploading the Randomization Sequence</h3>
          <ol className="landing__steps">
            <li>
              On the Study Setup screen, toggle the <strong>Email me when a participant is allocated</strong>{' '}
              checkbox if you wish to receive real-time email alerts for central monitoring as bedside
              allocations occur.
            </li>
            <li>
              Under Study Setup, click <strong>Upload CSV</strong>.
            </li>
            <li>
              <strong>Format Specifications:</strong> The CSV file must contain the exact headers:{' '}
              <code className="user-guide__code">
                sequence_number, kit_code, site, strat, treatment_arm
              </code>
              <br />
              <strong>Note on Stratification:</strong> SPECTR supports site-wise stratification plus
              one additional stratum variable (e.g., Age, Biomarker, Disease Severity). If no
              additional stratum is required, populate the strat column with N/A.
            </li>
            <li>
              Upload your sequence CSV. Inspect the Sequence Preview table to confirm row counts,
              stratum distributions, and kit code mappings match your approved statistical plan.
            </li>
            <li>
              If errors are detected, revise the source CSV and re-upload. Once verified, click{' '}
              <strong>Back to Study</strong>.
            </li>
            <li>
              The study advances to Generated status, ready for investigator onboarding.
            </li>
          </ol>
        </div>

        <div className="landing__capability">
          <h3>Step 3: Provisioning Site Investigators &amp; Trial Activation</h3>
          <ol className="landing__steps">
            <li>
              In the Sites section of your dashboard, locate the relevant clinical site row and click{' '}
              <strong>Add Site Study Investigator</strong> under the Actions column.
            </li>
            <li>
              Select either <strong>Single Invite</strong> (enter investigator name and institutional
              email) or <strong>Bulk Upload</strong> (upload a CSV containing up to 10 investigator
              rosters).
            </li>
            <li>
              Click <strong>Add Study Site Investigator</strong>. An invitation containing login
              credentials and portal links is automatically dispatched from noreply@mmmr.in.
            </li>
            <li>
              <strong>Access Control:</strong> Under the Study Investigators panel at the bottom of
              the dashboard, you can review active accounts. To immediately terminate site access,
              click <strong>Revoke</strong>; this invalidates the active session and bars re-entry.
            </li>
            <li>
              <strong>Trial Activation:</strong> As soon as an investigator executes the very first
              allocation, the study automatically transitions to Active status. At this point, the
              randomization sequence is permanently locked—no further sequence uploads, edits, or
              deletions are permitted.
            </li>
          </ol>
        </div>

        <div className="landing__capability">
          <h3>Step 4: Data Monitoring &amp; CSV Audit Export</h3>
          <ol className="landing__steps">
            <li>Navigate to <strong>Randomized Sequence Records</strong> on the Study dashboard.</li>
            <li>Review real-time recruitment totals across sites, strata, and allocation arms.</li>
            <li>Click <strong>Export CSV</strong> to download the complete, tamper-evident dataset.</li>
            <li>
              Save the file directly to your secure, access-restricted institutional repository. The
              file exports in standard UTF-8 CSV formatting, preserving leading zeros, exact UTC
              timestamps, and complete audit trail metadata.
            </li>
          </ol>
        </div>
      </section>

      <section className="landing__section">
        <h2>5. Contingency, Downtime &amp; Disaster Recovery</h2>
        <ul className="landing__list">
          <li>
            <strong>Browser Delays:</strong> If a network lag or browser freeze occurs after clicking
            &quot;Randomize,&quot; do not click repeatedly. Wait 30 seconds, then check your site
            dashboard to confirm if the transaction was recorded in the Site Participant Records
            table.
          </li>
          <li>
            <strong>System Unavailability (&gt; 15 Minutes):</strong> If SPECTR cannot be accessed
            during an urgent point-of-care enrollment, switch immediately to your protocol-authorized
            backup procedure (e.g., Sequentially Numbered Opaque Sealed Envelopes - SNOSE).
          </li>
          <li>
            <strong>Reconciliation:</strong> Report all technical disruptions to the CTC immediately.
            Allocations completed via physical backup methods during downtime must be documented in a
            Note-to-File (NTF) and must not be retrospectively keyed into SPECTR without explicit
            authorization from the CTC.
          </li>
        </ul>
      </section>

      <footer className="landing__footer">
        <h2>Technical Support &amp; Inquiries</h2>
        <p>
          <strong>Platform Administration:</strong>{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </p>
      </footer>
    </article>
  )
}

export default UserGuideContent
