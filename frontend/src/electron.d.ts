interface Window {
  electronAPI?: {
    saveInvoicePdf: (
      invoiceNumber: string
    ) => Promise<{ filePath: string }>;
    saveRefundMemoPdf: (
      memoNumber: string
    ) => Promise<{ filePath: string }>;
  };
}
