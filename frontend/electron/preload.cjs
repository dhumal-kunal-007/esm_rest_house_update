const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  getPdfSaveDirectories: () => ipcRenderer.invoke("pdf:get-save-directories"),
  selectPdfSaveDirectory: (category) =>
    ipcRenderer.invoke("pdf:select-save-directory", category),
  savePrintablePdf: (category, fileName) =>
    ipcRenderer.invoke("pdf:save-printable", category, fileName),
  saveBookingDocuments: (bookingReference, documents) =>
    ipcRenderer.invoke(
      "booking-documents:save-local",
      bookingReference,
      documents
    ),
  saveInvoicePdf: (invoiceNumber) =>
    ipcRenderer.invoke("invoice:save-pdf", invoiceNumber),
  saveBillPdf: (billNumber) =>
    ipcRenderer.invoke("bill:save-pdf", billNumber),
  saveRefundMemoPdf: (memoNumber) =>
    ipcRenderer.invoke("refund-memo:save-pdf", memoNumber),
});