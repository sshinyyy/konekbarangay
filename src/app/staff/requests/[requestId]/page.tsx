import { StaffRequestReview } from "./review";
import Link from "next/link";

export default function StaffRequestReviewPage() {
  return (
    <main className="workspace-page">
      <div className="workspace-page__inner workspace-page__inner--wide">
        <header className="page-heading">
          <div>
            <p className="page-kicker">Staff workspace</p>
            <h1 className="page-title">Review request</h1>
            <p className="page-description">Verify the record, review documents, and update its status.</p>
          </div>
          <Link className="page-heading__link" href="/staff/requests">Back to queue</Link>
        </header>
        <div className="page-content"><StaffRequestReview /></div>
      </div>
    </main>
  );
}