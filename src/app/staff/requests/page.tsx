import { StaffRequestQueue } from "./queue";

export default function StaffRequestsPage() {
  return (
    <main className="workspace-page">
      <div className="workspace-page__inner workspace-page__inner--wide">
        <header className="page-heading">
          <div>
            <p className="page-kicker">Staff workspace</p>
            <h1 className="page-title">Request queue</h1>
            <p className="page-description">Review resident submissions, verify profiles, and record decisions.</p>
          </div>
        </header>
        <div className="page-content">
          <StaffRequestQueue />
        </div>
      </div>
    </main>
  );
}