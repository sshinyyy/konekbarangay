import "server-only";

import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

export const DOCUMENT_TEMPLATE_VERSION = "barangay-document-v1";

export type IssuedDocumentSnapshot = {
  templateVersion: string;
  requestNumber: string;
  documentType: string;
  purpose: string;
  issuedAt: string;
  issuedTo: {
    name: string;
    birthDate: string;
    civilStatus: string | null;
    contactNumber: string | null;
    address: string;
  };
};

const styles = StyleSheet.create({
  page: { paddingTop: 52, paddingBottom: 44, paddingHorizontal: 54, fontFamily: "Helvetica", color: "#17231f" },
  header: { alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#a7b7ae", paddingBottom: 18, marginBottom: 28 },
  jurisdiction: { fontSize: 10, color: "#52645b", textTransform: "uppercase" },
  title: { fontSize: 20, marginTop: 12, fontWeight: 700, color: "#153f32" },
  subtitle: { fontSize: 9, marginTop: 6, color: "#52645b" },
  issuedTo: { fontSize: 10, lineHeight: 1.6, marginBottom: 16 },
  name: { fontSize: 14, fontWeight: 700, marginBottom: 5 },
  row: { flexDirection: "row", marginBottom: 9 },
  label: { width: 112, fontSize: 9, color: "#52645b" },
  value: { flex: 1, fontSize: 10 },
  sectionTitle: { fontSize: 9, color: "#52645b", textTransform: "uppercase", marginBottom: 8 },
  purpose: { fontSize: 10, lineHeight: 1.5, borderWidth: 1, borderColor: "#d4ded8", padding: 12, minHeight: 48 },
  verification: { flexDirection: "row", alignItems: "center", marginTop: 28, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#d4ded8" },
  qr: { width: 94, height: 94 },
  verificationText: { marginLeft: 16, flex: 1, fontSize: 8, lineHeight: 1.5, color: "#52645b" },
  serial: { fontSize: 10, color: "#153f32", marginBottom: 5 },
  footer: { position: "absolute", bottom: 22, left: 54, right: 54, textAlign: "center", fontSize: 7, color: "#728078" },
});

const documentTitles: Record<string, string> = {
  barangay_clearance: "Barangay Clearance",
  barangay_id: "Barangay Identification",
  certificate_of_residency: "Certificate of Residency",
};

export async function renderIssuedDocumentPdf(
  snapshot: IssuedDocumentSnapshot,
  serialNumber: string,
  qrDataUrl: string,
) {
  const pdf = (
    <Document title={documentTitles[snapshot.documentType] ?? "Barangay Document"}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.jurisdiction}>Barangay {snapshot.issuedTo.address.split(",").at(-3)?.trim() || ""}</Text>
          <Text style={styles.title}>{documentTitles[snapshot.documentType] ?? "Barangay Document"}</Text>
          <Text style={styles.subtitle}>Request {snapshot.requestNumber}</Text>
        </View>

        <View style={styles.issuedTo}>
          <Text style={styles.name}>{snapshot.issuedTo.name}</Text>
          <View style={styles.row}><Text style={styles.label}>Date of birth</Text><Text style={styles.value}>{snapshot.issuedTo.birthDate}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Civil status</Text><Text style={styles.value}>{snapshot.issuedTo.civilStatus || "Not provided"}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Address</Text><Text style={styles.value}>{snapshot.issuedTo.address}</Text></View>
        </View>

        <Text style={styles.sectionTitle}>Purpose</Text>
        <Text style={styles.purpose}>{snapshot.purpose}</Text>

        <View style={styles.row}><Text style={styles.label}>Date issued</Text><Text style={styles.value}>{new Date(snapshot.issuedAt).toLocaleDateString("en-PH", { dateStyle: "long", timeZone: "Asia/Manila" })}</Text></View>
        {snapshot.issuedTo.contactNumber && (
          <View style={styles.row}><Text style={styles.label}>Contact</Text><Text style={styles.value}>{snapshot.issuedTo.contactNumber}</Text></View>
        )}

        <View style={styles.verification}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={qrDataUrl} style={styles.qr} />
          <View style={styles.verificationText}>
            <Text style={styles.serial}>Serial: {serialNumber}</Text>
            <Text>Scan the QR code to verify this document’s current status.</Text>
            <Text>Template: {snapshot.templateVersion}</Text>
          </View>
        </View>
        <Text style={styles.footer}>Issued by authorized barangay staff. Verify authenticity and current status using the QR code.</Text>
      </Page>
    </Document>
  );

  return renderToBuffer(pdf);
}