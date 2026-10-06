import { Link } from 'react-router-dom'

const GITHUB_URL = 'https://github.com/dhanush-kuma/SPECTR'
const DOCS_URL = 'https://github.com/dhanush-kuma/SPECTR/blob/main/docs/ENGINEERING.md'
const SITE_URL = 'https://spectr.mmmr.in'

const SUPPORTS = [
  {
    title: 'Instant Bedside Allocations',
    text: 'Real-time assignment generation at the clinic or point of care.',
  },
  {
    title: 'Emergency Unblinding',
    text: 'Optional audited code-break workflow for masked investigational interventions.',
  },
  {
    title: 'Parallel-Group RCT Designs',
    text: 'Supports 2-arm, multi-arm, and factorial trials randomized at the individual level.',
  },
  {
    title: 'No Dynamic Minimization',
    text: 'Does not execute on-the-fly adaptive covariate-adjusted allocation algorithms.',
  },
  {
    title: 'Custom Sequences & Stratification',
    text:
      'Ingests complex permuted blocks stratified by site and one additional factor (e.g., age, sex, severity, etc.).',
  },
  {
    title: 'Zero Direct Patient Identifiers',
    text: 'Never collects or stores patient names, contact numbers, or government IDs.',
  },
  {
    title: 'Multicenter Queue Isolation',
    text: 'Strictly confines investigators to their assigned institutional lists.',
  },
  {
    title: 'Blinding options',
    text: 'Supports participant, investigator, and statistician blinding.',
  },
  {
    title: 'Concurrency & Double-Draw Protection',
    text: 'Employs database row locks to handle simultaneous global traffic.',
  },
  {
    title: 'Duplicate Screening Guards',
    text: 'Prevents participant IDs from being randomized multiple times.',
  },
]

function SpectrLanding() {
  return (
    <article className="landing">
      <header className="landing__hero">
        <h1 className="landing__title">
          SPECTR&trade;: Secure Point-of-care Enrollment and Centralized Trial Randomization
        </h1>
        <p className="landing__lead">
          A free, open-source, GCP-compliant central allocation engine engineered for academic,
          investigator-initiated, and not-for-profit multicenter randomized controlled trials.
        </p>
        <div className="landing__cta">
          <Link className="btn-primary" to="/onboarding">
            Get Started / Request Onboarding
          </Link>
          <Link className="btn-secondary" to="/user-guide">
            User Guide
          </Link>
          <a
            className="btn-secondary"
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on GitHub
          </a>
          <a
            className="btn-secondary"
            href={DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Read Technical Documentation
          </a>
        </div>
      </header>

      <section className="landing__section">
        <h2>Overview</h2>
        <p>
          SPECTR&trade; provides central randomization and allocation concealment for clinical
          trialists. Designed and validated by trial methodologists, it eliminates the vulnerability
          of physical sealed envelopes (SNOSE) and avoids the prohibitive licensing costs of
          enterprise Randomization and Trial Supply Management (RTSM)/ Interactive Web Response System
          (IWRS) platforms.
        </p>
        <p>
          By uploading your own pre-computed randomisation sequences, SPECTR delivers instantaneous,
          tamper-evident treatment allocations directly to point-of-care investigators at the clinic
          or bedside.
        </p>
      </section>

      <section className="landing__section">
        <h2>Core Capabilities</h2>

        <div className="landing__capability">
          <h3>Methodological Flexibility</h3>
          <p>
            Seamlessly import pre-computed, stratified permuted-block sequences generated offline via
            R, Stata, SAS, or Python.
          </p>
        </div>

        <div className="landing__capability">
          <h3>Bedside Point-of-Care Allocation</h3>
          <p>
            A fast, streamlined, mobile-responsive interface built for clinical workflows.
            Investigators confirm participant eligibility and receive an immediate, immutable
            allocation assignment.
          </p>
        </div>

        <div className="landing__capability">
          <h3>Regulatory-Grade Audit Trails</h3>
          <p>
            Every allocation event generates an immutable digital record capturing study ID, screening
            ID, stratum tags, operator identity, IP address, and server-side UTC timestamps.
            Real-time automated dual notifications keep site coordinators and the central coordinating
            office synchronized.
          </p>
        </div>

        <div className="landing__capability">
          <h3>ICH-GCP &amp; Data Integrity Controls</h3>
          <p>Built around ICH-GCP E6(R2/R3) Section 5.5.3 and 21 CFR Part 11 principles:</p>
          <ul className="landing__list">
            <li>
              <strong>Absolute Allocation Concealment:</strong> Zero sequence predictability with no
              advance assignment pre-fetching.
            </li>
            <li>
              <strong>Database Row-Level Concurrency Locks:</strong> Eliminates race conditions and
              prevents double-allocation collisions during simultaneous multi-site draws.
            </li>
            <li>
              <strong>Role-Based Multi-Site Isolation:</strong> Site personnel are strictly isolated
              to their institution&apos;s designated allocation queues.
            </li>
          </ul>
        </div>
      </section>

      <section className="landing__section">
        <h2>SPECTR Supports</h2>
        <ul className="landing__supports">
          {SUPPORTS.map((item) => (
            <li key={item.title}>
              <strong>{item.title}:</strong> {item.text}
            </li>
          ))}
        </ul>
      </section>

      <section className="landing__section">
        <h2>How It Works</h2>
        <ol className="landing__steps">
          <li>
            <strong>Protocol Setup &amp; Sequence Ingestion:</strong> The trial biostatistician or
            lead coordinator defines study strata, configures site accounts, and imports the verified
            allocation sequence.
          </li>
          <li>
            <strong>Screening &amp; Validation:</strong> The point-of-care site investigator enters
            the participant screening ID and confirms all protocol eligibility criteria.
          </li>
          <li>
            <strong>Instant Allocation:</strong> SPECTR applies a database row lock, advances the
            active stratum queue by one position, and instantly reveals the treatment assignment.
          </li>
          <li>
            <strong>Audit Logging &amp; Central Confirmation:</strong> The system generates an
            immutable UTC-stamped audit entry - verifiable by the site investigator and the trial
            coordinating center, with an option to receive email alerts.
          </li>
        </ol>
      </section>

      <section className="landing__section landing__citation">
        <h2>Citation</h2>
        <p>
          When reporting randomization and allocation methodology in study protocols, ethics board
          submissions, preprints, or peer-reviewed manuscripts, please cite:
        </p>
        <p className="landing__cite-block">
          Pradeep M, Kumar D. SPECTR: Secure Point-of-care Enrollment and Centralized Trial
          Randomization [Computer software]. Available from:{' '}
          <a href={SITE_URL} target="_blank" rel="noopener noreferrer">
            {SITE_URL}
          </a>
        </p>
      </section>

      <footer className="landing__footer">
        <h2>Governance, Open Source &amp; Support</h2>
        <p>
          A free, open-source initiative developed by Dr. Manu Pradeep (Clinical Epidemiologist)
          &amp; Dhanush Kumar (Lead Developer), MM Medical Research (OPC) Pvt. Ltd., Cherthala,
          Kerala, India.
        </p>
        <p>
          SPECTR&trade; is a trademark of MM Medical Research (OPC) Pvt. Ltd.
        </p>
        <p>
          <strong>Source Code:</strong> Available under the AGPLv3 License on{' '}
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub</a>.
        </p>
      </footer>
    </article>
  )
}

export default SpectrLanding
