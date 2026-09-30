"use client";

import { useEffect, useState } from "react";

type VerificationResult = {
  valid: boolean;
  status: "valid" | "invalid_signature" | "not_found" | "revoked" | "expired" | "mismatch";
  document?: {
    documentType: string;
    serialNumber: string;
    issuedAt: string;
    expiresAt: string | null;
  };
};

const documentLabels: Record<string, string> = {
  barangay_clearance: "Barangay Clearance",
  barangay_id: "Barangay ID",
  certificate_of_residency: "Certificate of Residency",
};

const statusMessages: Record<VerificationResult["status"], string> = {
  valid: "This document is authentic and currently valid.",
  invalid_signature: "This QR code could not be authenticated.",
  not_found: "No matching issued document was found.",
  revoked: "This document has been revoked.",
  expired: "This document has expired.",
  mismatch: "The QR data does not match the issued record.",
};

export function VerificationResultView({ documentId, token }: { documentId: string; token: string }) {
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    void fetch(`/api/verify/${encodeURIComponent(documentId)}?t=${encodeURIComponent(token)}`, {
      cache: "no-store",
    }).then(async (response) => {
      const body = (await response.json()) as VerificationResult;
      if (isCurrent) setResult(body);
    }).catch(() => {
      if (isCurrent) setFailed(true);
    });

    return () => { isCurrent = false; };
  }, [documentId, token]);

  const isValid = result?.valid === true;

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-12">
      <section className="mx-auto max-w-xl rounded-lg border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Barangay document check</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">QR verification</h1>

        {failed ? (
          <p aria-live="polite" className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            Verification is temporarily unavailable. Try again later; do not treat the document as verified.
          </p>
        ) : result ? (
          <div className={`mt-6 rounded-md border p-4 ${isValid ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-red-300 bg-red-50 text-red-950"}`}>
            <p className="font-semibold">{statusMessages[result.status]}</p>
            {result.document && (
              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-zinc-600">Document</dt>
                <dd>{documentLabels[result.document.documentType] ?? result.document.documentType}</dd>
                <dt className="text-zinc-600">Serial</dt><dd>{result.document.serialNumber}</dd>
                <dt className="text-zinc-600">Issued</dt>
                <dd>{new Date(result.document.issuedAt).toLocaleDateString()}</dd>
                {result.document.expiresAt && <>
                  <dt className="text-zinc-600">Expires</dt>
                  <dd>{new Date(result.document.expiresAt).toLocaleDateString()}</dd>
                </>}
              </dl>
            )}
          </div>
        ) : (
          <p className="mt-6 text-sm text-zinc-600">Checking document status...</p>
        )}
        <p className="mt-6 text-xs text-zinc-500">
          This check confirms document status only; it does not verify the bearer’s identity.
        </p>
      </section>
    </main>
  );
}