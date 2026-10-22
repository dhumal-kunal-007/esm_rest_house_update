interface Window {
  electronAPI?: {
    getPdfSaveDirectories: () => Promise<{
      directories: Record<
        | "bills"
        | "invoices"
        | "refund-memos"
        | "reports"
        | "payment-transactions"
        | "feedback"
        | "booking-documents",
        string | null
      >;
    }>;
    selectPdfSaveDirectory: (
      category: "bills" | "invoices" | "refund-memos" | "reports" | "feedback" | "booking-documents"
    ) => Promise<{
      canceled: boolean;
      directory: string | null;
    }>;
    savePrintablePdf: (
      category:
        | "bills"
        | "invoices"
        | "refund-memos"
        | "reports"
        | "payment-transactions"
        | "feedback"
        | "booking-documents",
      fileName: string
    ) => Promise<{ filePath: string }>;
    saveBookingDocuments: (
      bookingReference: string,
      documents: Array<{
        personType: "BOOKING_PERSON" | "OCCUPANT";
        personName: string;
        documentIndex: number;
        mimeType: string;
        content: Uint8Array;
      }>
    ) => Promise<{ directory: string; files: string[] }>;
    scanBookingDocument: () => Promise<{
      fileName: string;
      mimeType: "image/jpeg";
      content: Uint8Array;
    } | null>;
    saveInvoicePdf: (
      invoiceNumber: string
    ) => Promise<{ filePath: string }>;
    saveBillPdf: (
      billNumber: string
    ) => Promise<{ filePath: string }>;
    saveRefundMemoPdf: (
      memoNumber: string
    ) => Promise<{ filePath: string }>;
  };
}
