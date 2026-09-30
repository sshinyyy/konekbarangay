import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as verifyIssuedDocument } from "@/app/api/verify/[documentId]/route";
import { signVerificationClaims } from "@/lib/documents/qr-signing";

vi.mock("server-only", () => ({}));
vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,test") },
}));
vi.mock("@/lib/documents/issued-pdf", () => ({
  DOCUMENT_TEMPLATE_VERSION: "integration-test-v1",
  renderIssuedDocumentPdf: vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70, 45])),
}));
vi.mock("@/lib/supabase/storage-admin", () => ({
  getSupabaseAdminStorage: () => ({
    upload: vi.fn().mockResolvedValue({ error: null }),
    remove: vi.fn().mockResolvedValue({ error: null }),
  }),
}));

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = testDatabaseUrl ? describe : describe.skip;
const fixture = {
  residentId: randomUUID(),
  otherResidentId: randomUUID(),
  staffId: randomUUID(),
  otherStaffId: randomUUID(),
  adminId: randomUUID(),
  requestId: randomUUID(),
  issueRequestId: randomUUID(),
  queueFirstRequestId: randomUUID(),
  queueSecondRequestId: randomUUID(),
  attachmentId: randomUUID(),
  documentId: randomUUID(),
};
let createdRequestIds: string[] = [];
let issuedTestDocumentId: string | null = null;

let client: Client | null = null;
let getIssuedDocumentForResident:
  | typeof import("@/lib/db/request-attachments").getIssuedDocumentForResident
  | null = null;
let getUploadedAttachmentForStaff:
  | typeof import("@/lib/db/request-attachments").getUploadedAttachmentForStaff
  | null = null;
let getResidentDocumentRequests:
  | typeof import("@/lib/db/document-requests").getResidentDocumentRequests
  | null = null;
let getStaffRequestDetail:
  | typeof import("@/lib/db/staff-requests").getStaffRequestDetail
  | null = null;
let getStaffRequestQueue:
  | typeof import("@/lib/db/staff-requests").getStaffRequestQueue
  | null = null;
let applyStaffReview:
  | typeof import("@/lib/db/staff-requests").applyStaffReview
  | null = null;
let RequestAssignedToAnotherStaffError:
  | typeof import("@/lib/db/staff-requests").RequestAssignedToAnotherStaffError
  | null = null;
let getResidentNotifications:
  | typeof import("@/lib/db/resident-notifications").getResidentNotifications
  | null = null;
let markResidentNotificationRead:
  | typeof import("@/lib/db/resident-notifications").markResidentNotificationRead
  | null = null;
let createResidentDocumentRequest:
  | typeof import("@/lib/db/document-requests").createResidentDocumentRequest
  | null = null;
let verifyResidentProfileForRequest:
  | typeof import("@/lib/db/staff-requests").verifyResidentProfileForRequest
  | null = null;
let issueApprovedRequest:
  | typeof import("@/lib/db/issue-document").issueApprovedRequest
  | null = null;
let IssueRequestAssignedToAnotherStaffError:
  | typeof import("@/lib/db/issue-document").IssueRequestAssignedToAnotherStaffError
  | null = null;
let revokeIssuedDocument:
  | typeof import("@/lib/db/revoke-issued-document").revokeIssuedDocument
  | null = null;
let IssuedDocumentAlreadyRevokedError:
  | typeof import("@/lib/db/revoke-issued-document").IssuedDocumentAlreadyRevokedError
  | null = null;
let IssuedDocumentAssignedToAnotherStaffError:
  | typeof import("@/lib/db/revoke-issued-document").IssuedDocumentAssignedToAnotherStaffError
  | null = null;
let closeDatabasePool: (() => Promise<void>) | null = null;

async function cleanFixture() {
  if (!client) return;
  const requestIds = [
    fixture.requestId,
    fixture.queueFirstRequestId,
    fixture.queueSecondRequestId,
    fixture.issueRequestId,
    ...createdRequestIds,
  ];
  await client.query("DELETE FROM qr_verification_logs WHERE scanned_document_id = $1", [fixture.documentId]);
  await client.query(
    "DELETE FROM audit_events WHERE entity_id = ANY($1::uuid[])",
    [[fixture.documentId, fixture.residentId, fixture.otherResidentId, issuedTestDocumentId, ...requestIds].filter(Boolean)],
  );
  await client.query(
    "DELETE FROM issued_documents WHERE id = $1 OR request_id = ANY($2::uuid[])",
    [fixture.documentId, requestIds],
  );
  await client.query("DELETE FROM request_attachments WHERE id = $1", [fixture.attachmentId]);
  await client.query(
    "DELETE FROM request_status_history WHERE request_id = ANY($1::uuid[])",
    [requestIds],
  );
  await client.query(
    "DELETE FROM in_app_notifications WHERE request_id = ANY($1::uuid[])",
    [requestIds],
  );
  await client.query(
    "DELETE FROM document_requests WHERE id = ANY($1::uuid[])",
    [requestIds],
  );
  await client.query("DELETE FROM resident_profiles WHERE user_id = ANY($1::uuid[])", [[
    fixture.residentId,
    fixture.otherResidentId,
  ]]);
  await client.query("DELETE FROM app_users WHERE id = ANY($1::uuid[])", [[
    fixture.residentId,
    fixture.otherResidentId,
    fixture.staffId,
    fixture.otherStaffId,
    fixture.adminId,
  ]]);
  createdRequestIds = [];
  issuedTestDocumentId = null;
}

databaseDescribe("issued-document resident ownership query (PostgreSQL)", () => {
  beforeAll(async () => {
    if (!testDatabaseUrl) return;
    vi.stubEnv("QR_SIGNING_KEY_ID", "integration-test-key");
    vi.stubEnv("QR_SIGNING_SECRET", Buffer.alloc(32, 21).toString("base64url"));
    process.env.DATABASE_URL = testDatabaseUrl;
    client = new Client({ connectionString: testDatabaseUrl });
    await client.connect();

    const requestAttachments = await import("@/lib/db/request-attachments");
    const documentRequests = await import("@/lib/db/document-requests");
    const staffRequests = await import("@/lib/db/staff-requests");
    const residentNotifications = await import("@/lib/db/resident-notifications");
    const issueDocument = await import("@/lib/db/issue-document");
    const revocation = await import("@/lib/db/revoke-issued-document");
    const { getDatabasePool } = await import("@/lib/db/pool");
    getIssuedDocumentForResident = requestAttachments.getIssuedDocumentForResident;
    getUploadedAttachmentForStaff = requestAttachments.getUploadedAttachmentForStaff;
    getResidentDocumentRequests = documentRequests.getResidentDocumentRequests;
    createResidentDocumentRequest = documentRequests.createResidentDocumentRequest;
    getStaffRequestDetail = staffRequests.getStaffRequestDetail;
    getStaffRequestQueue = staffRequests.getStaffRequestQueue;
    applyStaffReview = staffRequests.applyStaffReview;
    RequestAssignedToAnotherStaffError = staffRequests.RequestAssignedToAnotherStaffError;
    verifyResidentProfileForRequest = staffRequests.verifyResidentProfileForRequest;
    issueApprovedRequest = issueDocument.issueApprovedRequest;
    IssueRequestAssignedToAnotherStaffError = issueDocument.IssueRequestAssignedToAnotherStaffError;
    getResidentNotifications = residentNotifications.getResidentNotifications;
    markResidentNotificationRead = residentNotifications.markResidentNotificationRead;
    revokeIssuedDocument = revocation.revokeIssuedDocument;
    IssuedDocumentAlreadyRevokedError = revocation.IssuedDocumentAlreadyRevokedError;
    IssuedDocumentAssignedToAnotherStaffError = revocation.IssuedDocumentAssignedToAnotherStaffError;
    closeDatabasePool = async () => getDatabasePool().end();
  });

  beforeEach(async () => {
    await cleanFixture();
    if (!client) throw new Error("TEST_DATABASE_URL is required for PostgreSQL integration tests.");

    await client.query(
      `INSERT INTO app_users (id, auth_user_id, role, email, display_name)
       VALUES
         ($1, $2, 'resident', $3, 'Integration Resident'),
         ($4, $5, 'resident', $6, 'Other Integration Resident'),
         ($7, $8, 'staff', $9, 'Integration Staff')`,
      [
        fixture.residentId,
        `auth-${fixture.residentId}`,
        `resident-${fixture.residentId}@example.test`,
        fixture.otherResidentId,
        `auth-${fixture.otherResidentId}`,
        `resident-${fixture.otherResidentId}@example.test`,
        fixture.staffId,
        `auth-${fixture.staffId}`,
        `staff-${fixture.staffId}@example.test`,
      ],
    );
    await client.query(
      `INSERT INTO app_users (id, auth_user_id, role, email, display_name)
       VALUES
         ($1, $2, 'staff', $3, 'Other Integration Staff'),
         ($4, $5, 'admin', $6, 'Integration Admin')`,
      [
        fixture.otherStaffId,
        `auth-${fixture.otherStaffId}`,
        `staff-${fixture.otherStaffId}@example.test`,
        fixture.adminId,
        `auth-${fixture.adminId}`,
        `admin-${fixture.adminId}@example.test`,
      ],
    );
    await client.query(
      `INSERT INTO document_requests (id, request_number, resident_user_id, document_type, purpose, status)
       VALUES ($1, $2, $3, 'barangay_clearance', 'PostgreSQL integration test', 'issued')`,
      [fixture.requestId, `TEST-${fixture.requestId}`, fixture.residentId],
    );
    await client.query(
      `INSERT INTO resident_profiles (
         user_id, first_name, last_name, birth_date, house_street, barangay, municipality, province
       ) VALUES
         ($1, 'Integration', 'Resident', '1990-01-01', 'Test Street', 'Test Barangay', 'Test City', 'Test Province'),
         ($2, 'Queue', 'Searcher', '1990-01-01', 'Test Street', 'Test Barangay', 'Test City', 'Test Province')`,
      [fixture.residentId, fixture.otherResidentId],
    );
    await client.query(
      `UPDATE resident_profiles SET profile_verified_at = now(), verified_by = $2 WHERE user_id = $1`,
      [fixture.residentId, fixture.staffId],
    );
    await client.query(
      `INSERT INTO document_requests (id, request_number, resident_user_id, document_type, purpose, status)
       VALUES ($1, $2, $3, 'barangay_clearance', 'Employment application', 'approved')`,
      [fixture.issueRequestId, `ISSUE-${fixture.issueRequestId}`, fixture.residentId],
    );
    await client.query(
      `INSERT INTO document_requests (
         id, request_number, resident_user_id, document_type, purpose, status, submitted_at
       ) VALUES
         ($1, $2, $3, 'barangay_clearance', 'Queue pagination first', 'submitted', now() - interval '2 minutes'),
         ($4, $5, $3, 'barangay_id', 'Queue pagination second', 'submitted', now() - interval '1 minute')`,
      [
        fixture.queueFirstRequestId,
        `QUEUE-FIRST-${fixture.queueFirstRequestId}`,
        fixture.otherResidentId,
        fixture.queueSecondRequestId,
        `QUEUE-SECOND-${fixture.queueSecondRequestId}`,
      ],
    );
    await client.query(
      `INSERT INTO request_attachments (
         id, request_id, uploaded_by, storage_object_path, original_filename,
         content_type, byte_size, status, uploaded_at
       ) VALUES ($1, $2, $3, $4, 'proof.pdf', 'application/pdf', 5, 'uploaded', now())`,
      [
        fixture.attachmentId,
        fixture.queueFirstRequestId,
        fixture.otherResidentId,
        `supporting/${fixture.queueFirstRequestId}/${fixture.attachmentId}/proof.pdf`,
      ],
    );
    await client.query(
      `INSERT INTO issued_documents (
         id, request_id, version, serial_number, document_type,
         issued_to_display_name, issued_at, storage_object_path,
         content_sha256_hex, content_snapshot, verification_key_id,
         qr_signature_hex, issued_by
       ) VALUES ($1, $2, 1, $3, 'barangay_clearance', 'Integration Resident', now(),
                $4, $5, $6::jsonb, 'test-key', $7, $8)`,
      [
        fixture.documentId,
        fixture.requestId,
        `TEST-${fixture.documentId}`,
        `issued/${fixture.requestId}/${fixture.documentId}/v1.pdf`,
        "a".repeat(64),
        JSON.stringify({ templateVersion: "test", purpose: "integration" }),
        "b".repeat(64),
        fixture.staffId,
      ],
    );
  });

  afterEach(cleanFixture);

  afterAll(async () => {
    await cleanFixture();
    await closeDatabasePool?.();
    await client?.end();
    vi.unstubAllEnvs();
  });

  it("returns a document only to its resident owner and hides revoked documents", async () => {
    if (!getIssuedDocumentForResident) throw new Error("Database test setup did not complete.");

    await expect(getIssuedDocumentForResident(fixture.documentId, fixture.residentId)).resolves.toEqual({
      storageObjectPath: `issued/${fixture.requestId}/${fixture.documentId}/v1.pdf`,
      serialNumber: `TEST-${fixture.documentId}`,
    });
    await expect(getIssuedDocumentForResident(fixture.documentId, fixture.otherResidentId)).resolves.toBeNull();

    await client?.query(
      `UPDATE issued_documents
       SET is_revoked = true, revoked_at = now(), revoked_by = $2, revocation_reason = 'test'
       WHERE id = $1`,
      [fixture.documentId, fixture.staffId],
    );
    await expect(getIssuedDocumentForResident(fixture.documentId, fixture.residentId)).resolves.toBeNull();
  });

  it("paginates the staff queue and searches receipt numbers and resident names", async () => {
    if (!getStaffRequestQueue) throw new Error("Database test setup did not complete.");

    const firstPage = await getStaffRequestQueue({
      status: "submitted",
      search: "",
      page: 1,
      pageSize: 1,
      staffUserId: fixture.staffId,
      canManageAll: false,
    });
    const secondPage = await getStaffRequestQueue({
      status: "submitted",
      search: "",
      page: 2,
      pageSize: 1,
      staffUserId: fixture.staffId,
      canManageAll: false,
    });
    expect(firstPage.total).toBe(2);
    expect(firstPage.requests.map((request) => request.id)).toEqual([fixture.queueFirstRequestId]);
    expect(secondPage.total).toBe(2);
    expect(secondPage.requests.map((request) => request.id)).toEqual([fixture.queueSecondRequestId]);

    const receiptSearch = await getStaffRequestQueue({
      status: "submitted",
      search: "QUEUE-FIRST",
      page: 1,
      pageSize: 25,
      staffUserId: fixture.staffId,
      canManageAll: false,
    });
    expect(receiptSearch.total).toBe(1);
    expect(receiptSearch.requests[0].id).toBe(fixture.queueFirstRequestId);

    const residentSearch = await getStaffRequestQueue({
      status: "submitted",
      search: "Queue Searcher",
      page: 1,
      pageSize: 25,
      staffUserId: fixture.staffId,
      canManageAll: false,
    });
    expect(residentSearch.total).toBe(2);
    expect(residentSearch.requests.map((request) => request.residentName)).toEqual([
      "Queue Searcher",
      "Queue Searcher",
    ]);
  });

  it("limits queue, detail, review, and attachment access by assignment with an admin override", async () => {
    if (
      !client ||
      !getStaffRequestQueue ||
      !getStaffRequestDetail ||
      !getUploadedAttachmentForStaff ||
      !applyStaffReview ||
      !RequestAssignedToAnotherStaffError ||
      !verifyResidentProfileForRequest ||
      !issueApprovedRequest ||
      !IssueRequestAssignedToAnotherStaffError ||
      !revokeIssuedDocument ||
      !IssuedDocumentAssignedToAnotherStaffError
    ) {
      throw new Error("Database test setup did not complete.");
    }

    await client.query(
      "UPDATE document_requests SET assigned_to = $2 WHERE id = $1",
      [fixture.queueFirstRequestId, fixture.otherStaffId],
    );

    const currentStaffQueue = await getStaffRequestQueue({
      status: "submitted",
      search: "",
      page: 1,
      pageSize: 25,
      staffUserId: fixture.staffId,
      canManageAll: false,
    });
    expect(currentStaffQueue.requests.map((request) => request.id)).toEqual([fixture.queueSecondRequestId]);

    const adminQueue = await getStaffRequestQueue({
      status: "submitted",
      search: "",
      page: 1,
      pageSize: 25,
      staffUserId: fixture.adminId,
      canManageAll: true,
    });
    expect(adminQueue.total).toBe(2);
    expect(adminQueue.requests.find((request) => request.id === fixture.queueFirstRequestId)).toMatchObject({
      assignedTo: fixture.otherStaffId,
      assignedToName: "Other Integration Staff",
    });

    await expect(getStaffRequestDetail(fixture.queueFirstRequestId, fixture.staffId, false)).resolves.toBeNull();
    await expect(getStaffRequestDetail(fixture.queueFirstRequestId, fixture.otherStaffId, false)).resolves.toMatchObject({
      id: fixture.queueFirstRequestId,
      assignedTo: fixture.otherStaffId,
      assignedToName: "Other Integration Staff",
    });
    await expect(getStaffRequestDetail(fixture.queueFirstRequestId, fixture.adminId, true)).resolves.toMatchObject({
      id: fixture.queueFirstRequestId,
      assignedTo: fixture.otherStaffId,
    });

    await expect(getUploadedAttachmentForStaff(fixture.attachmentId, fixture.staffId, false)).resolves.toBeNull();
    await expect(getUploadedAttachmentForStaff(fixture.attachmentId, fixture.otherStaffId, false)).resolves.toMatchObject({
      storageObjectPath: `supporting/${fixture.queueFirstRequestId}/${fixture.attachmentId}/proof.pdf`,
    });
    await expect(getUploadedAttachmentForStaff(fixture.attachmentId, fixture.adminId, true)).resolves.toMatchObject({
      originalFilename: "proof.pdf",
    });
    await expect(verifyResidentProfileForRequest({
      requestId: fixture.queueFirstRequestId,
      actorUserId: fixture.staffId,
      canManageAll: false,
    })).rejects.toBeInstanceOf(RequestAssignedToAnotherStaffError);

    await expect(applyStaffReview({
      requestId: fixture.queueFirstRequestId,
      actorUserId: fixture.staffId,
      canManageAll: false,
      action: "start_review",
      note: null,
    })).rejects.toBeInstanceOf(RequestAssignedToAnotherStaffError);
    await expect(applyStaffReview({
      requestId: fixture.queueFirstRequestId,
      actorUserId: fixture.otherStaffId,
      canManageAll: false,
      action: "start_review",
      note: null,
    })).resolves.toEqual({ fromStatus: "submitted", toStatus: "under_review" });

    await client.query(
      "UPDATE document_requests SET assigned_to = $2 WHERE id = $1",
      [fixture.issueRequestId, fixture.otherStaffId],
    );
    await expect(issueApprovedRequest({
      requestId: fixture.issueRequestId,
      actorUserId: fixture.staffId,
      canManageAll: false,
      verificationOrigin: "http://localhost:3000",
    })).rejects.toBeInstanceOf(IssueRequestAssignedToAnotherStaffError);

    await client.query(
      "UPDATE document_requests SET assigned_to = $2 WHERE id = $1",
      [fixture.requestId, fixture.otherStaffId],
    );
    await expect(revokeIssuedDocument({
      documentId: fixture.documentId,
      actorUserId: fixture.staffId,
      canManageAll: false,
      reason: "Assignment access test",
    })).rejects.toBeInstanceOf(IssuedDocumentAssignedToAnotherStaffError);
  });

  it("notifies the resident when their request is submitted", async () => {
    if (!client || !createResidentDocumentRequest) {
      throw new Error("Database test setup did not complete.");
    }

    const requestNumber = `SUBMITTED-${randomUUID()}`;
    const created = await createResidentDocumentRequest({
      userId: fixture.residentId,
      requestNumber,
      documentType: "barangay_clearance",
      purpose: "Employment application",
    });
    createdRequestIds.push(created.id);

    const notification = await client.query(
      `SELECT user_id AS "userId", request_id AS "requestId", event_type AS "eventType", message
       FROM in_app_notifications WHERE request_id = $1`,
      [created.id],
    );
    expect(notification.rows).toEqual([{
      userId: fixture.residentId,
      requestId: created.id,
      eventType: "request.submitted",
      message: `Your document request ${requestNumber} was submitted.`,
    }]);
  });

  it("notifies the resident when staff verifies their profile", async () => {
    if (!client || !verifyResidentProfileForRequest) {
      throw new Error("Database test setup did not complete.");
    }

    await expect(verifyResidentProfileForRequest({
      requestId: fixture.queueFirstRequestId,
      actorUserId: fixture.staffId,
      canManageAll: false,
    })).resolves.toBe(fixture.otherResidentId);

    const notification = await client.query(
      `SELECT user_id AS "userId", request_id AS "requestId", event_type AS "eventType", message
       FROM in_app_notifications WHERE request_id = $1`,
      [fixture.queueFirstRequestId],
    );
    expect(notification.rows).toEqual([{
      userId: fixture.otherResidentId,
      requestId: fixture.queueFirstRequestId,
      eventType: "profile.verified",
      message: "Your resident profile has been verified by staff.",
    }]);
  });

  it("notifies the resident when an approved request is issued", async () => {
    if (!client || !issueApprovedRequest) {
      throw new Error("Database test setup did not complete.");
    }

    const issued = await issueApprovedRequest({
      requestId: fixture.issueRequestId,
      actorUserId: fixture.staffId,
      canManageAll: false,
      verificationOrigin: "http://localhost:3000",
    });
    issuedTestDocumentId = issued.id;

    const notification = await client.query(
      `SELECT user_id AS "userId", request_id AS "requestId", event_type AS "eventType", message
       FROM in_app_notifications WHERE request_id = $1`,
      [fixture.issueRequestId],
    );
    expect(notification.rows).toEqual([{
      userId: fixture.residentId,
      requestId: fixture.issueRequestId,
      eventType: "document.issued",
      message: `Your document request ISSUE-${fixture.issueRequestId} has been issued.`,
    }]);
  });

  it("writes the staff review transition and audit event in one transaction", async () => {
    if (!client || !applyStaffReview || !getResidentNotifications || !markResidentNotificationRead) {
      throw new Error("Database test setup did not complete.");
    }

    const transition = await applyStaffReview({
      requestId: fixture.queueFirstRequestId,
      actorUserId: fixture.staffId,
      canManageAll: false,
      action: "start_review",
      note: null,
    });
    expect(transition).toEqual({ fromStatus: "submitted", toStatus: "under_review" });

    const audit = await client.query(
      `SELECT actor_user_id AS "actorUserId", action, entity_type AS "entityType", details
       FROM audit_events WHERE entity_id = $1`,
      [fixture.queueFirstRequestId],
    );
    expect(audit.rows).toEqual([{
      actorUserId: fixture.staffId,
      action: "document_request.reviewed",
      entityType: "document_request",
      details: {
        action: "start_review",
        fromStatus: "submitted",
        toStatus: "under_review",
        note: null,
      },
    }]);

    const history = await client.query(
      `SELECT from_status AS "fromStatus", to_status AS "toStatus", changed_by AS "changedBy"
       FROM request_status_history WHERE request_id = $1`,
      [fixture.queueFirstRequestId],
    );
    expect(history.rows).toEqual([{
      fromStatus: "submitted",
      toStatus: "under_review",
      changedBy: fixture.staffId,
    }]);
    const notifications = await client.query(
      `SELECT id, user_id AS "userId", request_id AS "requestId", event_type AS "eventType", message
       FROM in_app_notifications WHERE request_id = $1`,
      [fixture.queueFirstRequestId],
    );
    expect(notifications.rows).toEqual([{
      id: expect.any(String),
      userId: fixture.otherResidentId,
      requestId: fixture.queueFirstRequestId,
      eventType: "request.under_review",
      message: `Your document request QUEUE-FIRST-${fixture.queueFirstRequestId} is now under review.`,
    }]);

    const residentInbox = await getResidentNotifications(fixture.otherResidentId);
    expect(residentInbox.unreadCount).toBe(1);
    expect(residentInbox.notifications[0]).toMatchObject({
      id: notifications.rows[0].id,
      requestId: fixture.queueFirstRequestId,
      eventType: "request.under_review",
      readAt: null,
    });
    expect(await getResidentNotifications(fixture.residentId)).toEqual({
      notifications: [],
      unreadCount: 0,
    });

    const markedRead = await markResidentNotificationRead(
      notifications.rows[0].id,
      fixture.otherResidentId,
    );
    expect(markedRead?.id).toBe(notifications.rows[0].id);
    expect(Number.isNaN(Date.parse(markedRead?.readAt ?? ""))).toBe(false);
    expect(await markResidentNotificationRead(notifications.rows[0].id, fixture.residentId)).toBeNull();
    expect((await getResidentNotifications(fixture.otherResidentId)).unreadCount).toBe(0);
  });

  it("revokes transactionally, audits the actor and reason, and refuses a second revocation", async () => {
    if (
      !client ||
      !getIssuedDocumentForResident ||
      !getResidentDocumentRequests ||
      !getResidentNotifications ||
      !getStaffRequestDetail ||
      !revokeIssuedDocument ||
      !IssuedDocumentAlreadyRevokedError
    ) {
      throw new Error("Database test setup did not complete.");
    }

    const reason = "Incorrect resident details";
    const revoked = await revokeIssuedDocument({
      documentId: fixture.documentId,
      actorUserId: fixture.staffId,
      canManageAll: false,
      reason,
    });
    expect(revoked.serialNumber).toBe(`TEST-${fixture.documentId}`);
    expect(Number.isNaN(Date.parse(revoked.revokedAt))).toBe(false);

    const documentState = await client.query(
      `SELECT is_revoked AS "isRevoked", revoked_by AS "revokedBy", revocation_reason AS "reason"
       FROM issued_documents WHERE id = $1`,
      [fixture.documentId],
    );
    expect(documentState.rows[0]).toEqual({
      isRevoked: true,
      revokedBy: fixture.staffId,
      reason,
    });

    const audit = await client.query(
      `SELECT actor_user_id AS "actorUserId", action, details
       FROM audit_events WHERE entity_id = $1 AND action = 'document.revoked'`,
      [fixture.documentId],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toEqual({
      actorUserId: fixture.staffId,
      action: "document.revoked",
      details: { serialNumber: `TEST-${fixture.documentId}`, reason },
    });
    const residentNotifications = await getResidentNotifications(fixture.residentId);
    expect(residentNotifications.unreadCount).toBe(1);
    expect(residentNotifications.notifications[0]).toMatchObject({
      requestId: fixture.requestId,
      eventType: "document.revoked",
      message: `Your issued document TEST-${fixture.documentId} was revoked. Reason: ${reason}`,
      readAt: null,
    });
    const notifications = await client.query(
      `SELECT user_id AS "userId", request_id AS "requestId", event_type AS "eventType", message
       FROM in_app_notifications WHERE request_id = $1`,
      [fixture.requestId],
    );
    expect(notifications.rows).toEqual([{
      userId: fixture.residentId,
      requestId: fixture.requestId,
      eventType: "document.revoked",
      message: `Your issued document TEST-${fixture.documentId} was revoked. Reason: ${reason}`,
    }]);

    const residentRequests = await getResidentDocumentRequests(fixture.residentId);
    expect(residentRequests.find((request) => request.id === fixture.requestId)).toMatchObject({
      id: fixture.requestId,
      status: "issued",
      issuedDocumentId: fixture.documentId,
      issuedIsRevoked: true,
      issuedRevocationReason: reason,
    });
    const staffDetail = await getStaffRequestDetail(fixture.requestId, fixture.staffId, false);
    expect(staffDetail).toMatchObject({
      id: fixture.requestId,
      issuedDocumentId: fixture.documentId,
      issuedIsRevoked: true,
      issuedRevocationReason: reason,
    });

    await expect(revokeIssuedDocument({
      documentId: fixture.documentId,
      actorUserId: fixture.staffId,
      canManageAll: false,
      reason,
    })).rejects.toBeInstanceOf(IssuedDocumentAlreadyRevokedError);
    await expect(getIssuedDocumentForResident(fixture.documentId, fixture.residentId)).resolves.toBeNull();

    const issuedResult = await client.query<{
      serialNumber: string;
      issuedAt: Date;
      contentSha256Hex: string;
    }>(
      `SELECT serial_number AS "serialNumber", issued_at AS "issuedAt",
              content_sha256_hex AS "contentSha256Hex"
       FROM issued_documents WHERE id = $1`,
      [fixture.documentId],
    );
    const issued = issuedResult.rows[0];
    const signed = signVerificationClaims({
      documentId: fixture.documentId,
      serial: issued.serialNumber,
      type: "barangay_clearance",
      issuedAt: issued.issuedAt.toISOString(),
      expiresAt: null,
      contentSha256: issued.contentSha256Hex,
    });
    await client.query(
      `UPDATE issued_documents SET verification_key_id = $2, qr_signature_hex = $3 WHERE id = $1`,
      [fixture.documentId, signed.claims.kid, signed.signature],
    );
    const verificationUrl = new URL(`http://localhost/api/verify/${fixture.documentId}`);
    verificationUrl.searchParams.set("t", signed.token);
    const verificationResponse = await verifyIssuedDocument(
      new Request(verificationUrl),
      { params: Promise.resolve({ documentId: fixture.documentId }) },
    );
    expect(verificationResponse.status).toBe(200);
    expect(await verificationResponse.json()).toEqual({ valid: false, status: "revoked" });
  });
});