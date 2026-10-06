import { Link } from 'react-router-dom'

const ONBOARDING_EMAIL = 'mmmedicalresearch@outlook.com'

function TrialOnboardingContent() {
  const mailSubject = encodeURIComponent('[SPECTR Onboarding Request] - [Your Study Acronym / Title]')
  const mailtoHref = `mailto:${ONBOARDING_EMAIL}?subject=${mailSubject}`

  return (
    <article className="landing">
      <header className="landing__hero">
        <div className="landing__hero-head">
          <Link className="btn-secondary landing__back-home" to="/">
            Back to Home
          </Link>
          <h1 className="landing__title">Trial Onboarding &amp; Services</h1>
        </div>
      </header>

      <section className="landing__section">
        <p>
          SPECTR delivers GCP-compliant, point-of-care clinical trial randomization through two
          engagement pathways:
        </p>

        <div className="landing__capability">
          <h3>1. Self-Service Access (Software Only — Free for Academic Trials)</h3>
          <p>
            100% Free of charge for non-commercial, investigator-initiated trials (IITs), academic
            dissertation studies, and public research institutions. Best suited for trial teams with
            their own biostatistician who already have an approved randomization sequence ready to
            deploy.
          </p>
          <ul className="landing__list">
            <li>
              <strong>What you get:</strong> Complete access to the hosted SPECTR web platform at
              zero cost. Includes role-based credentials for clinical site staff and coordinators,
              bedside point-of-care allocation, real-time stratum tracking, and full audit-trail CSV
              exports.
            </li>
            <li>
              <strong>Your responsibility:</strong> You generate your own stratified permuted-block
              CSV sequence file offline and ingest it directly through the central coordinator
              dashboard.
            </li>
          </ul>
        </div>

        <div className="landing__capability">
          <h3>2. Managed Onboarding &amp; Methodological Support (Paid Professional Package)</h3>
          <p>
            Designed for academic teams, departments, or research groups seeking expert clinical
            epidemiology and biostatistical assistance with trial design, custom sequence generation,
            and turnkey deployment.
          </p>
          <p>
            <strong>What you get:</strong> Everything in Self-Service, plus:
          </p>
          <ul className="landing__list">
            <li>
              <strong>Methodological Consultation:</strong> Guidance on stratification variables,
              block length variation, and allocation ratios from our clinical epidemiology team.
            </li>
            <li>
              <strong>Sequence Generation &amp; Ingestion:</strong> Independent, reproducible,
              seed-locked sequence creation and validation.
            </li>
            <li>
              <strong>Turnkey Setup &amp; Provisioning:</strong> Complete study configuration, site
              and investigator account provisioning, and pre-launch dry-run testing before patient
              enrollment begins.
            </li>
            <li>
              <strong>Pricing:</strong> Custom fee estimate provided based on study scale, number of
              clinical sites, and stratification complexity (packages starting from ₹5,000 upwards,
              suitable as an itemized cost in academic research grants).
            </li>
          </ul>
        </div>
      </section>

      <section className="landing__section">
        <h2>How to Request Onboarding</h2>
        <p>
          To register a study or request platform access, email{' '}
          <a href={mailtoHref}>{ONBOARDING_EMAIL}</a> with the subject line:
        </p>
        <p>[SPECTR Onboarding Request] - [Your Study Acronym / Title]</p>
        <p>Please provide the following details in your email:</p>

        <div className="landing__capability">
          <h3>1. Investigator &amp; Institution Details</h3>
          <ul className="landing__list">
            <li>Principal Investigator name and designation</li>
            <li>Institution and department</li>
            <li>Official email address and contact phone number</li>
          </ul>
        </div>

        <div className="landing__capability">
          <h3>2. Trial Summary</h3>
          <ul className="landing__list">
            <li>
              Study title, design, proposed sample size, and stratification variables (max 500 words)
            </li>
            <li>Estimated enrollment start date and number of participating hospital sites</li>
          </ul>
        </div>

        <div className="landing__capability">
          <h3>3. Trial Type &amp; Funding Status</h3>
          <ul className="landing__list">
            <li>
              <strong>Category:</strong> Academic / Investigator-Initiated (qualifies for free
              Self-Service software), Non-Profit Grant, or Industry-Sponsored
            </li>
            <li>Funding body or institutional grant status</li>
          </ul>
        </div>

        <div className="landing__capability">
          <h3>4. Preferred Engagement Model</h3>
          <ul className="landing__list">
            <li>
              Indicate whether you require Self-Service Access (Software-only, Free for academic
              trials) or the Managed Onboarding &amp; Sequence Package (Paid service starting from
              ₹5,000; an official estimate/invoice will be provided for your grant or departmental
              budget).
            </li>
          </ul>
        </div>

        <p>
          Our team reviews submissions and responds within 5 to 7 business days with account
          provisioning instructions or an initial methodological consultation.
        </p>
      </section>
    </article>
  )
}

export default TrialOnboardingContent
