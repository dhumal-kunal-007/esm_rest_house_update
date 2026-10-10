const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  saveInvoicePdf: (invoiceNumber) =>
    ipcRenderer.invoke("invoice:save-pdf", invoiceNumber),
  saveRefundMemoPdf: (memoNumber) =>
    ipcRenderer.invoke("refund-memo:save-pdf", memoNumber),
});