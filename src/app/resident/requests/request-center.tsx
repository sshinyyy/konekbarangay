"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getPublicSupabaseConfig } from "@/lib/config/public-env";

type DocumentType = "barangay_clearance" | "barangay_id" | "certificate_of_residency";
type RequestStatus =
  | "submitted"
  | "under_review"
  | "needs_information"
  | "approved"
  | "rejected"
  | "generating"
  | "ready_for_issuance"
  | "issued"
  | "cancelled";

type ResidentRequest = {
  id: string;
  requestNumber: string;
  documentType: DocumentType;
  status: RequestStatus;
  purpose: string;
  submittedAt: string;
  attachmentCount: number;
  issuedDocumentId: string | null;
  issuedSerialNumber: string | null;
  issuedIsRevoked: boolean | null;
  issuedRevocationReason: string | null;
};

type ResidentNotification = {
  id: string;
  requestId: string | null;
  eventType: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};

const documentLabels: Record<DocumentType, string> = {
  barangay_clearance: "Barangay Clearance",
  barangay_id: "Barangay ID",
  certificate_of_residency: "Certificate of Residency",
};

const statusLabels: Record<RequestStatus, string> = {
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

const MAX_FILE_BYTES = 3 * 1024 * 1024;

async function loadResidentNotifications(accessToken: string) {
  const response = await fetch("/api/resident/notifications", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Could not load updates.");
  return (await response.json()) as {
    notifications: ResidentNotification[];
    unreadCount: number;
  };
}

function getFileContentType(file: File) {
  if (file.type) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "application/pdf";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  return "";
}

function IssuedDocumentDownload({
  documentId,
  serialNumber,
}: {
  documentId: string;
  serialNumber: string | null;
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function downloadDocument() {
    const downloadWindow = window.open("about:blank", "_blank");
    setIsLoading(true);
    setMessage("");

    try {
      const { data: { session } } = await getSupabaseClient().auth.getSession();
      if (!session) {
        downloadWindow?.close();
        router.replace("/login");
        return;
      }

      const response = await fetch(`/api/resident/documents/${documentId}/download`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Could not create a secure download link.");
      const result = (await response.json()) as { signedUrl: string };
      if (downloadWindow) downloadWindow.location.href = result.signedUrl;
      else setMessage("Your browser blocked the download window. Allow pop-ups and retry.");
    } catch {
      downloadWindow?.close();
      setMessage("Could not download this document. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        className="text-sm font-medium text-emerald-800 underline disabled:opacity-50"
        disabled={isLoading}
        onClick={() => void downloadDocument()}
        type="button"
      >
        {isLoading ? "Preparing download..." : `Download issued document${serialNumber ? ` (${serialNumber})` : ""}`}
      </button>
      {message && <p aria-live="polite" className="mt-1 text-xs text-red-700">{message}</p>}
    </div>
  );
}

function RequestAttachmentUpload({
  request,
  onUploaded,
}: {
  request: ResidentRequest;
  onUploaded: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const canUpload = request.status === "submitted" || request.status === "needs_information";

  async function handleUpload() {
    if (!file) return;

    const contentType = getFileContentType(file);
    if (!contentType || !["application/pdf", "image/jpeg", "image/png"].includes(contentType)) {
      setIsError(true);
      setMessage("Choose a PDF, JPEG, or PNG file.");
      return;
    }
    if (file.size < 1 || file.size > MAX_FILE_BYTES) {
      setIsError(true);
      setMessage("Each file must be 3 MiB or smaller.");
      return;
    }

    setIsUploading(true);
    setIsError(false);
    setMessage("");

    try {
      const { data: { session } } = await getSupabaseClient().auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }

      const intentResponse = await fetch(`/api/resident/requests/${request.id}/attachments`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fileName: file.name, contentType, size: file.size }),
      });
      if (!intentResponse.ok) {
        const error = (await intentResponse.json()) as { error?: string };
        if (error.error === "attachment_limit_reached") {
          throw new Error("You can attach up to five files to a request.");
        }
        throw new Error("Could not prepare this file for upload.");
      }

      const intent = (await intentResponse.json()) as {
        attachmentId: string;
        path: string;
        token: string;
        contentType: string;
      };
      const storageBucket = getPublicSupabaseConfig().storageBucket;
      const { error: uploadError } = await getSupabaseClient()
        .storage
        .from(storageBucket)
        .uploadToSignedUrl(intent.path, intent.token, file, { contentType: intent.contentType });
      if (uploadError) throw uploadError;

      const finalizeResponse = await fetch(
        `/api/resident/attachments/${intent.attachmentId}/finalize`,
        { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } },
      );
      if (!finalizeResponse.ok) {
        throw new Error("The uploaded file could not be verified. Please retry.");
      }

      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setMessage("Supporting document uploaded and verified.");
      onUploaded();
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  }

  if (!canUpload) {
    return <p className="mt-2 text-xs text-zinc-500">Uploads are closed for this request status.</p>;
  }

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs text-zinc-600">
        Supporting files: {request.attachmentCount}/5 · PDF, JPEG, or PNG · up to 3 MiB each
      </p>
      {request.attachmentCount < 5 && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
            className="block max-w-full text-xs text-zinc-700 file:mr-3 file:rounded-sm file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-xs file:font-medium file:text-zinc-800 hover:file:bg-zinc-200"
            onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
            ref={inputRef}
            type="file"
          />
          <button
            className="rounded-md border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!file || isUploading}
            onClick={handleUpload}
            type="button"
          >
            {isUploading ? "Uploading..." : "Upload file"}
          </button>
        </div>
      )}
      {message && (
        <p aria-live="polite" className={`text-xs ${isError ? "text-red-700" : "text-emerald-800"}`}>
          {message}
        </p>
      )}
    </div>
  );
}

export function RequestCenter() {
  const router = useRouter();
  const [documentType, setDocumentType] = useState<DocumentType>("barangay_clearance");
  const [purpose, setPurpose] = useState("");
  const [requests, setRequests] = useState<ResidentRequest[]>([]);
  const [notifications, setNotifications] = useState<ResidentNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationError, setNotificationError] = useState("");
  const [markingNotificationId, setMarkingNotificationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [profileRequired, setProfileRequired] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const inProgressCount = requests.filter((request) =>
    ["submitted", "under_review", "needs_information", "approved", "generating", "ready_for_issuance"].includes(request.status),
  ).length;
  const issuedCount = requests.filter((request) => request.status === "issued" && !request.issuedIsRevoked).length;

  useEffect(() => {
    let isCurrent = true;
    void getSupabaseClient().auth.getSession().then(async ({ data, error }) => {
      if (error) throw error;
      const session = data.session;
      if (!session) {
        router.replace("/login");
        if (isCurrent) setIsLoading(false);
        return;
      }

      try {
        const profileResponse = await fetch("/api/resident/profile", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });

        if (profileResponse.status === 401 || profileResponse.status === 403) {
          router.replace("/login");
          return;
        }
        if (!profileResponse.ok) {
          throw new Error("Profile check failed");
        }

        const profileResult = (await profileResponse.json()) as { profile: object | null };
        if (!profileResult.profile) {
          if (isCurrent) setProfileRequired(true);
          return;
        }

        const [requestResponse, notificationResult] = await Promise.all([
          fetch("/api/resident/requests", {
            headers: { Authorization: `Bearer ${session.access_token}` },
            cache: "no-store",
          }),
          loadResidentNotifications(session.access_token).catch(() => null),
        ]);
        if (!requestResponse.ok) {
          throw new Error("Request list failed");
        }

        const result = (await requestResponse.json()) as { requests: ResidentRequest[] };
        if (isCurrent) {
          setRequests(result.requests);
          if (notificationResult) {
            setNotifications(notificationResult.notifications);
            setUnreadCount(notificationResult.unreadCount);
          } else {
            setNotificationError("Updates could not be loaded.");
          }
        }
      } catch {
        if (isCurrent) {
          setIsError(true);
          setMessage("Could not load requests. Please try again.");
        }
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }).catch(() => {
      if (isCurrent) {
        setIsError(true);
        setMessage("Could not load requests. Check Supabase configuration and try again.");
        setIsLoading(false);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [router]);

  async function markNotificationRead(notification: ResidentNotification) {
    if (notification.readAt || markingNotificationId) return;
    setMarkingNotificationId(notification.id);
    setNotificationError("");

    try {
      const { data: { session } } = await getSupabaseClient().auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }
      const response = await fetch(`/api/resident/notifications/${notification.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) throw new Error("Could not mark update as read.");
      const result = (await response.json()) as { notification: { id: string; readAt: string } };
      setNotifications((current) => current.map((item) =>
        item.id === notification.id ? { ...item, readAt: result.notification.readAt } : item,
      ));
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch {
      setNotificationError("Could not mark update as read. Please try again.");
    } finally {
      setMarkingNotificationId(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setIsError(false);
    setMessage("");

    try {
      const { data: { session } } = await getSupabaseClient().auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }

      const response = await fetch("/api/resident/requests", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentType, purpose }),
      });
      const result = await response.json();

      if (response.status === 409 && result.error === "profile_required") {
        setProfileRequired(true);
        return;
      }
      if (!response.ok) {
        throw new Error("Request submission failed");
      }

      setRequests((current) => [
        { ...(result.request as ResidentRequest), attachmentCount: 0 },
        ...current,
      ]);
      const notificationResult = await loadResidentNotifications(session.access_token).catch(() => null);
      if (notificationResult) {
        setNotifications(notificationResult.notifications);
        setUnreadCount(notificationResult.unreadCount);
        setNotificationError("");
      }
      setPurpose("");
      setMessage(`Request submitted. Receipt: ${result.request.requestNumber}`);
    } catch {
      setIsError(true);
      setMessage("Could not submit your request. Check the details and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <p className="loading-state" role="status">Loading your requests...</p>;
  }

  if (profileRequired) {
    return (
      <div className="notice-panel notice-panel--warning">
        <h2 className="font-semibold text-zinc-900">Complete your resident profile first</h2>
        <p className="mt-1 text-sm text-zinc-700">
          A complete profile is needed before you can submit a document request.
        </p>
        <Link className="button-primary mt-4" href="/resident/profile">
          Complete profile
        </Link>
      </div>
    );
  }

  return (
    <div className="request-center">
      <div aria-label="Request overview" className="metric-strip">
        <div><span>Total requests</span><strong>{requests.length}</strong></div>
        <div><span>In progress</span><strong>{inProgressCount}</strong></div>
        <div><span>Documents issued</span><strong>{issuedCount}</strong></div>
        <div><span>Unread updates</span><strong>{unreadCount}</strong></div>
      </div>

      <div className="request-center__top">
      <section aria-labelledby="updates-heading" className="updates-panel">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="section-title" id="updates-heading">Recent updates</h2>
          <p className="section-meta">{unreadCount} unread</p>
        </div>
        {notificationError && <p aria-live="polite" className="mt-3 text-sm text-red-700">{notificationError}</p>}
        {notifications.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600">No updates yet.</p>
        ) : (
          <ul className="updates-list">
            {notifications.map((notification) => (
              <li className="updates-list__item" key={notification.id}>
                <div className="flex min-w-0 items-start gap-2">
                  {!notification.readAt && <span aria-label="Unread" className="mt-1.5 size-2 shrink-0 rounded-full bg-emerald-700" />}
                  <div>
                    <p className={`text-sm ${notification.readAt ? "text-zinc-700" : "font-medium text-zinc-950"}`}>
                      {notification.message}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">{new Date(notification.createdAt).toLocaleString()}</p>
                  </div>
                </div>
                {!notification.readAt && (
                  <button
                    className="quiet-action"
                    disabled={markingNotificationId !== null}
                    onClick={() => void markNotificationRead(notification)}
                    type="button"
                  >
                    {markingNotificationId === notification.id ? "Saving..." : "Mark read"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <form className="request-form" onSubmit={handleSubmit}>
        <div className="request-form__heading">
          <div><p className="page-kicker">New request</p><h2 className="section-title">Choose a document</h2></div>
          <span className="form-step">Step 1 of 1</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium text-zinc-800">
            Document
            <select
              onChange={(event) => setDocumentType(event.target.value as DocumentType)}
              value={documentType}
            >
              {Object.entries(documentLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium text-zinc-800">
            Purpose
            <textarea
              className="min-h-24 w-full resize-y"
              maxLength={500}
              onChange={(event) => setPurpose(event.target.value)}
              placeholder="What will the document be used for?"
              required
              value={purpose}
            />
          </label>
        </div>
        {message && (
          <p aria-live="polite" className={`text-sm ${isError ? "text-red-700" : "text-emerald-800"}`}>
            {message}
          </p>
        )}
        <button
          className="button-primary"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Submitting..." : "Submit request"}
        </button>
      </form>
      </div>

      <section aria-labelledby="requests-heading" className="request-list-section">
        <div className="section-heading-row"><h2 className="section-title" id="requests-heading">Your requests</h2><span className="section-meta">Newest first</span></div>
        {requests.length === 0 ? (
          <p className="empty-state">No document requests yet.</p>
        ) : (
          <ul className="request-list">
            {requests.map((request) => (
              <li className="request-item" key={request.id}>
                <div className="request-item__main">
                  <p className="font-medium text-zinc-900">{documentLabels[request.documentType]}</p>
                  <p className="mt-1 text-sm text-zinc-600">
                    Receipt {request.requestNumber} · {new Date(request.submittedAt).toLocaleDateString()}
                  </p>
                  <p className="mt-1 text-sm text-zinc-600">{request.purpose}</p>
                  {request.status === "issued" && request.issuedDocumentId && (
                    request.issuedIsRevoked ? (
                      <p className="mt-2 text-sm text-red-800" role="status">
                        Document revoked{request.issuedSerialNumber ? ` (${request.issuedSerialNumber})` : ""}.
                        {request.issuedRevocationReason ? ` Reason: ${request.issuedRevocationReason}` : ""}
                      </p>
                    ) : (
                      <IssuedDocumentDownload
                        documentId={request.issuedDocumentId}
                        serialNumber={request.issuedSerialNumber}
                      />
                    )
                  )}
                  <RequestAttachmentUpload
                    onUploaded={() => {
                      setRequests((current) => current.map((item) =>
                        item.id === request.id
                          ? { ...item, attachmentCount: item.attachmentCount + 1 }
                          : item,
                      ));
                    }}
                    request={request}
                  />
                </div>
                <span className="status-pill" data-status={request.status}>
                  {statusLabels[request.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}