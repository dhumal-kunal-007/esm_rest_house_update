const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("path");

ipcMain.handle("invoice:save-pdf", async (event, invoiceNumber) => {
  if (typeof invoiceNumber !== "string" || !/^\d{8}$/.test(invoiceNumber)) {
    throw new Error("A valid invoice number is required to save the invoice PDF.");
  }

  const outputDirectory = "C:\\ESM_INVOICE";
  let outputPath = path.join(outputDirectory, `${invoiceNumber}.pdf`);
  try {
    await fs.access(outputPath);
    outputPath = path.join(outputDirectory, "Fresh Start", `${invoiceNumber}.pdf`);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  const pdf = await event.sender.printToPDF({
    printBackground: true,
    preferCSSPageSize: true,
  });

  if (pdf.length < 1024 || pdf.subarray(0, 5).toString() !== "%PDF-") {
    throw new Error("The invoice PDF could not be generated.");
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, pdf);
  return { filePath: outputPath };
});

ipcMain.handle("refund-memo:save-pdf", async (event, memoNumber) => {
  if (
    typeof memoNumber !== "string" ||
    !/^[A-Z0-9_-]{1,80}$/i.test(memoNumber)
  ) {
    throw new Error("A valid refund memo number is required to save the PDF.");
  }

  const outputDirectory = "C:\\ESM_REFUND";
  const outputPath = path.join(outputDirectory, `${memoNumber}.pdf`);
  const pdf = await event.sender.printToPDF({
    printBackground: true,
    preferCSSPageSize: true,
  });

  if (pdf.length < 1024 || pdf.subarray(0, 5).toString() !== "%PDF-") {
    throw new Error("The refund memo PDF could not be generated.");
  }

  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(outputPath, pdf);
  return { filePath: outputPath };
});

async function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 650,

    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    if (app.isPackaged) {
      await mainWindow.loadFile(
        path.join(__dirname, "..", "dist", "index.html")
      );
    } else {
      await mainWindow.loadURL(
        process.env.VITE_DEV_SERVER_URL || "http://localhost:5173"
      );
    }
  } catch (error) {
    console.error("Unable to load the ESM Rest House desktop UI:", error);
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});