import { VerificationResultView } from "./verification-result";

export default async function VerifyDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ documentId: string }>;
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const [{ documentId }, query] = await Promise.all([params, searchParams]);
  const token = Array.isArray(query.t) ? query.t[0] ?? "" : query.t ?? "";

  return <VerificationResultView documentId={documentId} token={token} />;
}