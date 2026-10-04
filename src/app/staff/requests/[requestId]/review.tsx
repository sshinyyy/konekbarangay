"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

type RequestDetail = {
  id: string;
  requestNumber: string;
  documentType: string;
  status: string;
  purpose: string;
  submittedAt: string;
  assignedTo: string | null;
  assignedToName: string | null;
  decisionNote: string | null;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  suffix: string | null;
  birthDate: string | null;
  civilStatus: string | null;
  contactNumber: string | null;
  houseStreet: string | null;
  purokSitio: string | null;
  barangay: string | null;
  municipality: string | null;
  province: string | null;
  postalCode: string | null;
  profileVerifiedAt: string | null;
  issuedDocumentId: string | null;
  issuedSerialNumber: string | null;
  issuedAt: string | null;
  issuedIsRevoked: boolean | null;
  issuedRevokedAt: string | null;
  issuedRevocationReason: string | null;
  attachments: { id: string; originalFilename: string; contentType: string; byteSize: number; status: string }[];
  history: { fromStatus: string | null; toStatus: string; changeNote: string | null; changedAt: string; changedBy: string | null }[];
};

const documentLabels: Record<string, string> = {
  barangay_clearance: "Barangay Clearance",
  barangay_id: "Barangay ID",
  certificate_of_residency: "Certificate of Residency",
};

const statusLabels: Record<string, string> = {
  submitted: "Submitted",
  under_review: "Under review",
  needs_information: "Needs information",
  approved: "Approved",
  rejected: "Rejected",
  generating: "Preparing document",
  ready_for_issuance: "Ready for issuance",
  issued: "Issued",
  cancelled: "Cancelled",
};

export function StaffRequestReview() {
  const router = useRouter();
  const params = useParams<{ requestId: string }>();
  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [note, setNote] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isVerifyingProfile, setIsVerifyingProfile] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [revocationReason, setRevocationReason] = useState("");
  const [isForbidden, setIsForbidden] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    void getSupabaseClient().auth.getSession().then(async ({ data, error }) => {
      if (error) throw error;
      if (!data.session) {
        router.replace("/login");
        return;
      }

      const response = await fetch(`/api/staff/requests/${params.requestId}`, {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        cache: "no-store",
      });
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (response.status === 403) {
        if (isCurrent) setIsForbidden(true);
        return;
      }
      if (!response.ok) throw new Error("Request detail failed");
      const result = (await response.json()) as { request: RequestDetail };
      if (isCurrent) setRequest(result.request);
    }).catch(() => {
      if (isCurrent) {
        setIsError(true);
        setMessage("Could not load this request. Please return to the staff queue and try again.");
      }
    }).finally(() => {
      if (isCurrent) setIsLoading(false);
    });

    return () => { isCurrent = false; };
  }, [params.requestId, router]);

  async function applyDecision(action: "start_review" | "request_information" | "approve" | "reject") {
    setIsSaving(true);
    setIsError(false);
    setMessage("");

    try {
      const { data: { session } } = await getSupabaseClient().auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }
      const response = await fetch(`/api/staff/requests/${params.requestId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, note }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        if (result.error === "review_note_required") {
          throw new Error("Add a note for requests needing information or rejection.");
        }
        if (result.error === "invalid_transition") {
          throw new Error("This request changed state. Reload it before recording another decision.");
        }
        if (result.error === "profile_not_verified") {
          throw new Error("Verify the resident profile before approving this request.");
        }
          if (result.error === "request_assigned_to_another_staff") {
            throw new Error("This request is assigned to another staff member.");
          }
        throw new Error("Could not save the review decision.");
      }
      router.refresh();
      window.location.reload();
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Could not save the review decision.");
    } finally {
      setIsSaving(false);
    }
  }

  async function verifyProfile() {
    setIsVerifyingProfile(true);
    setIsError(false);
    setMessage("");

    try {
      const { data: { session } } = await getSupabaseClient().auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }
      const response = await fetch(`/api/staff/requests/${params.requestId}/verify-profile`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = (await response.json()) as { error?: string };
      if (result.error === "request_assigned_to_another_staff") {
        throw new Error("This request is assigned to another staff member.");
      }
        if (!response.ok) throw new Error("Could not verify the resident profile.");
      window.location.reload();
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Could not verify the resident profile.");
    } finally {
      setIsVerifyingProfile(false);
    }
  }

  async function issueDocument() {
    setIsIssuing(true);
    setIsError(false);
    setMessage("");

    try {
      const { data: { session } } = await getSupabaseClient().auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }
      const response = await fetch(`/api/staff/requests/${params.requestId}/issue`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        if (result.error === "profile_not_verified") {
          throw new Error("Verify the resident profile before issuing this document.");
        }
        if (result.error === "request_not_approved") {
          throw new Error("Only approved requests can be issued.");
        }
          if (result.error === "request_assigned_to_another_staff") {
            throw new Error("This request is assigned to another staff member.");
          }
        throw new Error("Could not generate the document. Check the server signing/storage configuration.");
      }
      window.location.reload();
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Could not issue this document.");
    } finally {
      setIsIssuing(false);
    }
  }

  async function revokeDocument() {
    if (!request?.issuedDocumentId || revocationReason.trim().length < 5) return;
    if (!window.confirm(`Revoke ${request.issuedSerialNumber}? This cannot be undone.`)) return;

    setIsRevoking(true);
    setIsError(false);
    setMessage("");

    try {
      const { data: { session } } = await getSupabaseClient().auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }
      const response = await fetch(`/api/staff/documents/${request.issuedDocumentId}/revoke`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: revocationReason }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        if (result.error === "document_already_revoked") {
          window.location.reload();
          return;
        }
        if (result.error === "invalid_revocation") {
          throw new Error("Enter a revocation reason with at least five characters.");
        }
          if (result.error === "request_assigned_to_another_staff") {
            throw new Error("This request is assigned to another staff member.");
          }
        throw new Error("Could not revoke this document.");
      }
      window.location.reload();
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Could not revoke this document.");
    } finally {
      setIsRevoking(false);
    }
  }

  async function openAttachment(attachmentId: string) {
    try {
      const { data: { session } } = await getSupabaseClient().auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }
      const response = await fetch(`/api/staff/attachments/${attachmentId}/download`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Could not create a secure file link.");
      const result = (await response.json()) as { signedUrl: string };
      window.open(result.signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      setIsError(true);
      setMessage("Could not open the supporting file. Please try again.");
    }
  }

  if (isLoading) return <p className="loading-state" role="status">Loading request details...</p>;
  if (isForbidden) {
    return <p className="notice-panel notice-panel--warning">Staff access is required to review requests.</p>;
  }
  if (!request) {
    return <p className="text-sm text-red-700">{message || "Request not found."}</p>;
  }

  const residentName = [request.firstName, request.middleName, request.lastName, request.suffix]
    .filter(Boolean)
    .join(" ");
  const canStartReview = request.status === "submitted" || request.status === "needs_information";
  const canDecide = request.status === "under_review";

  return (
    <div className="request-review">
      <div className="request-review__header">
        <div>
          <Link className="text-sm font-medium text-emerald-800 underline" href="/staff/requests">Back to queue</Link>
          <h2 className="mt-3 text-xl font-semibold text-zinc-950">
            {documentLabels[request.documentType] ?? request.documentType}
          </h2>
          <p className="mt-1 text-sm text-zinc-600">Receipt {request.requestNumber}</p>
        </div>
        <span className="status-pill" data-status={request.status}>
          {statusLabels[request.status] ?? request.status}
        </span>
      </div>

      <section className="review-summary">
        <div className="review-summary__block">
          <h3>Resident details</h3>
          <dl>
            <dt className="text-zinc-500">Name</dt><dd className="text-zinc-900">{residentName || "Not provided"}</dd>
            <dt className="text-zinc-500">Birth date</dt><dd className="text-zinc-900">{request.birthDate || "Not provided"}</dd>
            <dt className="text-zinc-500">Civil status</dt><dd className="text-zinc-900">{request.civilStatus || "Not provided"}</dd>
            <dt className="text-zinc-500">Contact</dt><dd className="text-zinc-900">{request.contactNumber || "Not provided"}</dd>
            <dt className="text-zinc-500">Address</dt>
            <dd className="text-zinc-900">{[request.houseStreet, request.purokSitio, request.barangay, request.municipality, request.province, request.postalCode].filter(Boolean).join(", ") || "Not provided"}</dd>
            <dt className="text-zinc-500">Profile</dt>
            <dd className="text-zinc-900">
              {request.profileVerifiedAt ? "Staff verified" : "Unverified"}
              {!request.profileVerifiedAt && (
                <button className="ml-2 text-xs font-medium text-emerald-800 underline disabled:opacity-50" disabled={isVerifyingProfile} onClick={() => void verifyProfile()} type="button">
                  {isVerifyingProfile ? "Verifying..." : "Verify profile"}
                </button>
              )}
            </dd>
            <dt className="text-zinc-500">Assignment</dt>
            <dd className="text-zinc-900">{request.assignedTo ? request.assignedToName || "Assigned staff" : "Unassigned"}</dd>
          </dl>
        </div>
        <div className="review-summary__block">
          <h3>Request purpose</h3>
          <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-700">{request.purpose}</p>
          <p className="mt-2 text-xs text-zinc-500">Submitted {new Date(request.submittedAt).toLocaleString()}</p>
          {request.decisionNote && <p className="mt-3 text-sm text-zinc-700">Latest note: {request.decisionNote}</p>}
        </div>
      </section>

      <section className="review-section">
        <h3>Supporting files</h3>
        {request.attachments.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">No files attached.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100">
            {request.attachments.map((attachment) => (
              <li className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm" key={attachment.id}>
                <div>
                  <p className="font-medium text-zinc-800">{attachment.originalFilename}</p>
                  <p className="text-xs text-zinc-500">{attachment.contentType} · {Math.ceil(attachment.byteSize / 1024)} KB · {attachment.status}</p>
                </div>
                {attachment.status === "uploaded" && (
                  <button className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50" onClick={() => void openAttachment(attachment.id)} type="button">
                    Open securely
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="review-section">
        <h3>Status history</h3>
        <ol className="mt-3 space-y-3">
          {request.history.map((event, index) => (
            <li className="border-l-2 border-emerald-700 pl-3 text-sm" key={`${event.changedAt}-${index}`}>
              <p className="font-medium text-zinc-800">{statusLabels[event.toStatus] ?? event.toStatus}</p>
              <p className="text-xs text-zinc-500">{new Date(event.changedAt).toLocaleString()} · {event.changedBy || "System"}</p>
              {event.changeNote && <p className="mt-1 text-zinc-600">{event.changeNote}</p>}
            </li>
          ))}
        </ol>
      </section>

      {(canStartReview || canDecide) && (
          <section className="review-section">
            <h3>Review decision</h3>
          <label className="mt-3 block space-y-1 text-sm font-medium text-zinc-800">
            Staff note
            <textarea className="min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2 font-normal outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20" maxLength={500} onChange={(event) => setNote(event.target.value)} value={note} />
          </label>
          {message && <p aria-live="polite" className={`mt-3 text-sm ${isError ? "text-red-700" : "text-emerald-800"}`}>{message}</p>}
          <div className="review-actions">
            {canStartReview && <button className="rounded-md bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-900 disabled:opacity-60" disabled={isSaving} onClick={() => void applyDecision("start_review")} type="button">{request.status === "submitted" ? "Start review" : "Resume review"}</button>}
            {canDecide && <>
              <button className="rounded-md border border-amber-400 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-50 disabled:opacity-60" disabled={isSaving} onClick={() => void applyDecision("request_information")} type="button">Request information</button>
              <button className="rounded-md bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-60" disabled={isSaving} onClick={() => void applyDecision("approve")} type="button">Approve</button>
              <button className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-50 disabled:opacity-60" disabled={isSaving} onClick={() => void applyDecision("reject")} type="button">Reject</button>
            </>}
          </div>
        </section>
      )}

      {request.status === "approved" && !request.issuedDocumentId && (
        <section className="review-section">
          <h3>Document issuance</h3>
          <p className="mt-2 text-sm text-zinc-600">Generate a private PDF with a signed QR verification link.</p>
          {message && <p aria-live="polite" className={`mt-3 text-sm ${isError ? "text-red-700" : "text-emerald-800"}`}>{message}</p>}
          <button
            className="mt-4 rounded-md bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-60"
            disabled={isIssuing}
            onClick={() => void issueDocument()}
            type="button"
          >
            {isIssuing ? "Generating..." : "Generate and issue"}
          </button>
        </section>
      )}

      {request.status === "issued" && request.issuedDocumentId && (
        <section className="review-section">
          <h3>Issued document</h3>
          <p className="mt-2 text-sm text-zinc-700">Serial {request.issuedSerialNumber}</p>
          <p className="mt-1 text-xs text-zinc-500">Issued {request.issuedAt ? new Date(request.issuedAt).toLocaleString() : ""}</p>
          {request.issuedIsRevoked ? (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="status">
              <p className="font-semibold">Document revoked</p>
              <p className="mt-1">{request.issuedRevocationReason}</p>
              {request.issuedRevokedAt && <p className="mt-1 text-xs">Revoked {new Date(request.issuedRevokedAt).toLocaleString()}</p>}
            </div>
          ) : (
            <div className="mt-5 max-w-xl space-y-3 border-t border-zinc-200 pt-4">
              <label className="block space-y-1 text-sm font-medium text-zinc-800">
                Revocation reason
                <textarea
                  className="min-h-20 w-full rounded-md border border-zinc-300 px-3 py-2 font-normal outline-none focus:border-red-700 focus:ring-2 focus:ring-red-700/20"
                  maxLength={500}
                  onChange={(event) => setRevocationReason(event.target.value)}
                  value={revocationReason}
                />
              </label>
              {message && <p aria-live="polite" className={`text-sm ${isError ? "text-red-700" : "text-emerald-800"}`}>{message}</p>}
              <button
                className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isRevoking || revocationReason.trim().length < 5}
                onClick={() => void revokeDocument()}
                type="button"
              >
                {isRevoking ? "Revoking..." : "Revoke document"}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}