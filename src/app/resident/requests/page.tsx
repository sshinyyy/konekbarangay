import { RequestCenter } from "./request-center";
import Link from "next/link";

export default function ResidentRequestsPage() {
  return (
    <main className="workspace-page">
      <div className="workspace-page__inner">
        <header className="page-heading">
          <div>
            <p className="page-kicker">Resident portal</p>
            <h1 className="page-title">Document requests</h1>
            <p className="page-description">Start a request and follow its review through secure issuance.</p>
          </div>
          <Link className="page-heading__link" href="/resident/profile">Edit profile</Link>
        </header>
        <div className="page-content">
          <RequestCenter />
        </div>
      </div>
    </main>
  );
}