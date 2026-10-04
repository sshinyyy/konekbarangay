import Link from "next/link";

export default function Home() {
  return (
    <main className="home-page">
      <div className="home-page__inner">
        <section className="home-intro">
          <div className="home-copy">
            <p className="home-kicker">Digital barangay services</p>
            <h1 className="home-title">Barangay documents, <em>in one place.</em></h1>
            <p className="home-description">
              Submit a request, keep your resident profile up to date, and follow each step through issuance from one place.
            </p>
            <div className="home-actions">
              <Link className="button-primary" href="/register">Create resident account</Link>
              <Link className="button-secondary" href="/login">Sign in</Link>
            </div>
          </div>

          <aside aria-labelledby="workflow-heading" className="home-workflow">
            <p className="home-workflow__label">One connected process</p>
            <h2 id="workflow-heading">From request to release</h2>
            <ol className="workflow-list">
              <li>
                <span className="workflow-list__number">01</span>
                <div><strong>Set up your profile</strong><span>Enter the details needed for official documents.</span></div>
              </li>
              <li>
                <span className="workflow-list__number">02</span>
                <div><strong>Send a request</strong><span>Choose a document and attach supporting files.</span></div>
              </li>
              <li>
                <span className="workflow-list__number">03</span>
                <div><strong>Track the decision</strong><span>See updates and securely download issued documents.</span></div>
              </li>
            </ol>
            <Link className="home-staff-link" href="/login">Barangay staff sign in <span aria-hidden="true">→</span></Link>
          </aside>
        </section>

        <section aria-labelledby="services-heading" className="home-services">
          <div className="home-services__heading">
            <h2 id="services-heading">Available documents</h2>
            <p>Requests are reviewed by authorized barangay staff.</p>
          </div>
          <div className="service-list">
            <article>
              <h3>Barangay Clearance</h3>
              <p>For employment, transactions, and other stated purposes.</p>
            </article>
            <article>
              <h3>Barangay ID</h3>
              <p>Request an ID through the barangay’s review process.</p>
            </article>
            <article>
              <h3>Certificate of Residency</h3>
              <p>Request proof of residency for a specific purpose.</p>
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}
