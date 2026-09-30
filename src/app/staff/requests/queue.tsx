"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

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

type StaffRequest = {
  id: string;
  requestNumber: string;
  documentType: string;
  status: RequestStatus;
  purpose: string;
  submittedAt: string;
  residentName: string;
  assignedTo: string | null;
  assignedToName: string | null;
  attachmentCount: number;
};

const statusOptions: { value: RequestStatus | "all"; label: string }[] = [
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "Under review" },
  { value: "needs_information", label: "Needs information" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "generating", label: "Preparing document" },
  { value: "ready_for_issuance", label: "Ready for issuance" },
  { value: "issued", label: "Issued" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All requests" },
];

const documentLabels: Record<string, string> = {
  barangay_clearance: "Barangay Clearance",
  barangay_id: "Barangay ID",
  certificate_of_residency: "Certificate of Residency",
};

export function StaffRequestQueue() {
  const router = useRouter();
  const [status, setStatus] = useState<RequestStatus | "all">("submitted");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [requests, setRequests] = useState<StaffRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isForbidden, setIsForbidden] = useState(false);
  const [message, setMessage] = useState("");
  const pageSize = 25;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const nextSearch = searchInput.trim();
      if (nextSearch !== search || page !== 1) {
        setIsLoading(true);
        setMessage("");
        setSearch(nextSearch);
        setPage(1);
      }
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [page, search, searchInput]);

  useEffect(() => {
    let isCurrent = true;
    void getSupabaseClient().auth.getSession().then(async ({ data, error }) => {
      if (error) throw error;
      if (!data.session) {
        router.replace("/login");
        return;
      }

      const query = new URLSearchParams({
        status,
        page: String(page),
        pageSize: String(pageSize),
        q: search,
      });
      const response = await fetch(`/api/staff/requests?${query}`, {
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
      if (!response.ok) throw new Error("Request queue failed");

      const result = (await response.json()) as {
        requests: StaffRequest[];
        total: number;
        page: number;
        pageSize: number;
      };
      if (isCurrent) {
        setRequests(result.requests);
        setTotal(result.total);
        const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize));
        if (page > lastPage) {
          setIsLoading(true);
          setPage(lastPage);
        }
      }
    }).catch(() => {
      if (isCurrent) setMessage("Could not load the staff queue. Please try again.");
    }).finally(() => {
      if (isCurrent) setIsLoading(false);
    });

    return () => { isCurrent = false; };
  }, [page, pageSize, router, search, status]);

  if (isLoading) return <p className="text-sm text-zinc-600">Loading requests...</p>;

  if (isForbidden) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-5 text-sm text-zinc-800">
        This account does not have staff access. Ask an administrator to provision a staff role.
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-4">
        <label className="space-y-1 text-sm font-medium text-zinc-800">
          Search requests
          <input
            className="block min-w-64 rounded-md border border-zinc-300 bg-white px-3 py-2 font-normal"
            onChange={(event) => setSearchInput(event.target.value)}
            maxLength={100}
            placeholder="Receipt or resident name"
            type="search"
            value={searchInput}
          />
        </label>
        <label className="space-y-1 text-sm font-medium text-zinc-800">
          Request status
          <select
            className="block min-w-52 rounded-md border border-zinc-300 bg-white px-3 py-2 font-normal"
            onChange={(event) => {
              setIsLoading(true);
              setMessage("");
              setStatus(event.target.value as RequestStatus | "all");
              setPage(1);
            }}
            value={status}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <p className="text-sm text-zinc-600">
          {total} request{total === 1 ? "" : "s"}
          {total > 0 && ` · Showing ${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, total)}`}
        </p>
      </div>

      {message && <p aria-live="polite" className="py-4 text-sm text-red-700">{message}</p>}
      {isLoading ? (
        <p className="py-8 text-sm text-zinc-600">Loading requests...</p>
      ) : requests.length === 0 ? (
        <p className="py-8 text-sm text-zinc-600">
          {search ? "No requests match your search." : "No requests in this status."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
                <th className="py-3 pr-4 font-medium">Resident / receipt</th>
                <th className="py-3 pr-4 font-medium">Document</th>
                <th className="py-3 pr-4 font-medium">Submitted</th>
                <th className="py-3 pr-4 font-medium">Files</th>
                <th className="py-3 font-medium">Review</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr className="border-b border-zinc-100 align-top" key={request.id}>
                  <td className="py-4 pr-4">
                    <p className="font-medium text-zinc-900">{request.residentName || "Resident"}</p>
                    <p className="mt-1 text-xs text-zinc-500">{request.requestNumber}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {request.assignedTo ? `Assigned to ${request.assignedToName || "staff"}` : "Unassigned"}
                    </p>
                  </td>
                  <td className="py-4 pr-4">
                    <p className="text-zinc-800">{documentLabels[request.documentType] ?? request.documentType}</p>
                    <p className="mt-1 max-w-sm text-xs text-zinc-500">{request.purpose}</p>
                  </td>
                  <td className="py-4 pr-4 text-zinc-700">
                    {new Date(request.submittedAt).toLocaleDateString()}
                  </td>
                  <td className="py-4 pr-4 text-zinc-700">{request.attachmentCount}</td>
                  <td className="py-4">
                    <Link
                      className="font-medium text-emerald-800 underline"
                      href={`/staff/requests/${request.id}`}
                    >
                      Review
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!isLoading && total > 0 && (
        <nav aria-label="Request pages" className="flex items-center justify-between border-t border-zinc-200 py-4">
          <button
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => {
              setIsLoading(true);
              setMessage("");
              setPage((current) => Math.max(1, current - 1));
            }}
            type="button"
          >
            Previous
          </button>
          <p className="text-sm text-zinc-600">Page {page} of {Math.max(1, Math.ceil(total / pageSize))}</p>
          <button
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={page >= Math.ceil(total / pageSize)}
            onClick={() => {
              setIsLoading(true);
              setMessage("");
              setPage((current) => current + 1);
            }}
            type="button"
          >
            Next
          </button>
        </nav>
      )}
    </div>
  );
}