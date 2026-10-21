const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  utilityProcess,
} = require("electron");
const { autoUpdater } = require("electron-updater");
const fs = require("node:fs/promises");
const net = require("node:net");
const path = require("path");

let mainWindow;
let backendProcess;

const backendUrl = "http://127.0.0.1:5000/api/health";
const requiredEnvironmentKeys = [
  "DB_HOST",
  "DB_PORT",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
  "AUTH_TOKEN_SECRET",
];

function readEnvironmentValue(contents, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = contents.match(
    new RegExp(`^\\s*${escapedKey}\\s*=\\s*(.*)$`, "m")
  );
  if (!match) {
    return "";
  }

  return match[1].trim().replace(/^(["'])(.*)\1$/, "$2");
}

async function ensureBackendConfiguration() {
  const configDirectory = path.join(app.getPath("userData"), "backend");
  const configPath = path.join(configDirectory, ".env");

  try {
    await fs.access(configPath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }

    const selection = await dialog.showOpenDialog({
      title: "Select the backend .env configuration file",
      buttonLabel: "Use configuration",
      properties: ["openFile"],
      filters: [
        { name: "Environment file", extensions: ["env"] },
        { name: "All files", extensions: ["*"] },
      ],
    });

    if (selection.canceled || selection.filePaths.length === 0) {
      throw new Error(
        "Backend configuration is required. Select the backend .env file to continue."
      );
    }

    await fs.mkdir(configDirectory, { recursive: true });
    await fs.copyFile(selection.filePaths[0], configPath);
  }

  const contents = await fs.readFile(configPath, "utf8");
  validateBackendConfiguration(contents, configPath);

  return { configDirectory, configPath };
}

function validateBackendConfiguration(contents, configPath) {
  const missingKeys = requiredEnvironmentKeys.filter(
    (key) => !readEnvironmentValue(contents, key)
  );
  const tokenSecret = readEnvironmentValue(contents, "AUTH_TOKEN_SECRET");
  const dbPort = Number(readEnvironmentValue(contents, "DB_PORT"));

  if (!Number.isInteger(dbPort) || dbPort < 1 || dbPort > 65535) {
    missingKeys.push("DB_PORT (a valid port number)");
  }

  if (
    tokenSecret.startsWith("REPLACE_") ||
    Buffer.byteLength(tokenSecret, "utf8") < 32
  ) {
    missingKeys.push("AUTH_TOKEN_SECRET (at least 32 non-placeholder bytes)");
  }

  if (missingKeys.length > 0) {
    throw new Error(
      `The backend .env file at ${configPath} is missing valid settings: ${missingKeys.join(", ")}.`
    );
  }
}

function isPortAvailable() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({
      host: "127.0.0.1",
      port: 5000,
    });

    socket.once("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", (error) => {
      socket.destroy();
      if (error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT") {
        resolve(true);
      } else {
        reject(error);
      }
    });
  });
}

async function waitForBackend() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    let response;
    try {
      response = await fetch(backendUrl, {
        signal: AbortSignal.timeout(2000),
      });
    } catch (error) {
      if (
        error.name === "TypeError" &&
        ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EHOSTUNREACH"].includes(
          error.cause?.code
        )
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      if (error.name === "TimeoutError" || error.name === "AbortError") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      throw error;
    }

    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(
        result?.message ||
          "The backend is running, but it cannot connect to PostgreSQL."
      );
    }

    const result = await response.json();
    if (result.success && result.database === "PostgreSQL connected") {
      return;
    }

    throw new Error(
      result.message || "The backend is not ready to serve requests."
    );
  }

  throw new Error(
    "The backend did not start within 30 seconds. Check that PostgreSQL is running."
  );
}

async function startPackagedBackend() {
  if (!(await isPortAvailable())) {
    await waitForBackend();
    return;
  }

  const { configDirectory } = await ensureBackendConfiguration();
  const backendEntry = path.join(
    process.resourcesPath,
    "backend",
    "dist",
    "server.js"
  );

  backendProcess = utilityProcess.fork(backendEntry, [], {
    cwd: configDirectory,
    env: {
      ...process.env,
      PORT: "5000",
    },
    stdio: "pipe",
  });

  backendProcess.stdout?.on("data", (data) => {
    console.log(`[backend] ${data.toString().trimEnd()}`);
  });
  backendProcess.stderr?.on("data", (data) => {
    console.error(`[backend] ${data.toString().trimEnd()}`);
  });
  backendProcess.on("spawn", () => {
    console.log("Packaged backend process started.");
  });
  backendProcess.on("exit", (code) => {
    if (code !== 0) {
      console.error(`Packaged backend exited with code ${code}.`);
    }
  });

  await waitForBackend();
}

function configureAutoUpdates() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("error", (error) => {
    console.error("Desktop app update check failed:", error);
  });
  autoUpdater.on("update-downloaded", (info) => {
    void dialog
      .showMessageBox(mainWindow, {
        type: "info",
        title: "Update ready",
        message: `ESM Rest House ${info.version} is ready to install.`,
        detail: "Restart the app now to finish installing the update.",
        buttons: ["Restart now", "Later"],
        defaultId: 0,
        cancelId: 1,
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall();
        }
      })
      .catch((error) => {
        console.error("Unable to show the update-ready message:", error);
      });
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      console.error("Unable to check for desktop app updates:", error);
    });
  }, 5000);
}

const pdfCategories = {
  bills: "Bills",
  invoices: "Invoices",
  "refund-memos": "Refund Memos",
  reports: "Reports",
  "payment-transactions": "Reports",
  feedback: "Feedback",
  "booking-documents": "Booking Documents",
};

async function readPdfSaveSettings() {
  const settingsPath = path.join(
    app.getPath("userData"),
    "pdf-save-settings.json"
  );
  try {
    const settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));
    return settings && typeof settings === "object" ? settings : {};
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw new Error(`Unable to read PDF save settings: ${error.message}`);
  }
}

async function getPdfSaveDirectory(category, defaultDirectory) {
  const settings = await readPdfSaveSettings();
  const directory = settings.directories?.[category];

  if (
    directory !== undefined &&
    (typeof directory !== "string" || !path.isAbsolute(directory))
  ) {
    throw new Error(
      `The saved ${category} PDF folder is invalid. Choose the folder again.`
    );
  }

  return directory || defaultDirectory;
}

async function createPdf(event, outputPath, description) {
  const pdf = await event.sender.printToPDF({
    printBackground: true,
    preferCSSPageSize: true,
  });

  if (pdf.length < 1024 || pdf.subarray(0, 5).toString() !== "%PDF-") {
    throw new Error(`The ${description} PDF could not be generated.`);
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, pdf);
  return { filePath: outputPath };
}

function sanitizePdfFileName(fileName) {
  const sanitized = fileName
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .trim()
    .replace(/[. ]+$/g, "");
  if (!sanitized || sanitized === "." || sanitized === "..") {
    throw new Error("A valid PDF file name is required.");
  }
  return sanitized;
}

ipcMain.handle("pdf:get-save-directories", async () => {
  const settings = await readPdfSaveSettings();
  const directories = {};
  for (const category of Object.keys(pdfCategories)) {
    const directory = settings.directories?.[category];
    if (
      directory !== undefined &&
      (typeof directory !== "string" || !path.isAbsolute(directory))
    ) {
      throw new Error(`The saved ${category} PDF folder is invalid.`);
    }
    directories[category] = directory || null;
  }
  return { directories };
});

ipcMain.handle("pdf:select-save-directory", async (_event, category) => {
  if (!Object.hasOwn(pdfCategories, category)) {
    throw new Error("A supported PDF save folder category is required.");
  }
  const settingsPath = path.join(
    app.getPath("userData"),
    "pdf-save-settings.json"
  );
  const settings = await readPdfSaveSettings();
  const currentDirectory = settings.directories?.[category];

  const selection = await dialog.showOpenDialog({
    title: `Choose the ${pdfCategories[category]} PDF folder`,
    buttonLabel: "Use this folder",
    properties: ["openDirectory", "createDirectory"],
    ...(currentDirectory ? { defaultPath: currentDirectory } : {}),
  });
  if (selection.canceled || selection.filePaths.length === 0) {
    return { canceled: true, directory: currentDirectory || null };
  }

  const directory = selection.filePaths[0];
  await fs.mkdir(directory, { recursive: true });
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  settings.directories = {
    ...settings.directories,
    [category]: directory,
  };
  await fs.writeFile(
    settingsPath,
    JSON.stringify(settings, null, 2),
    "utf8"
  );
  return { canceled: false, directory };
});

ipcMain.handle("pdf:save-printable", async (event, category, fileName) => {
  if (!Object.hasOwn(pdfCategories, category)) {
    throw new Error("A supported printable document category is required.");
  }
  if (
    typeof fileName !== "string" ||
    fileName.length > 180 ||
    !/^[\w .()-]+$/.test(fileName)
  ) {
    throw new Error("A valid PDF file name is required.");
  }

  const defaultDirectories = {
    bills: "C:\\ESM_INVOICE",
    invoices: "C:\\ESM_INVOICE",
    "refund-memos": "C:\\ESM_REFUND",
    reports: path.join(app.getPath("documents"), "ESM Rest House", "Reports"),
    "booking-documents": path.join(
      app.getPath("documents"),
      "ESM Rest House",
      "Booking Documents"
    ),
    "payment-transactions": path.join(
      app.getPath("documents"),
      "ESM Rest House",
      "Reports"
    ),
    feedback: path.join(app.getPath("documents"), "ESM Rest House", "Feedback"),
  };
  const settingsCategory =
    category === "payment-transactions" ? "reports" : category;
  const outputDirectory = await getPdfSaveDirectory(
    settingsCategory,
    defaultDirectories[category]
  );
  const safeFileName = sanitizePdfFileName(fileName);
  let outputPath = path.join(outputDirectory, `${safeFileName}.pdf`);
  let suffix = 2;
  while (true) {
    try {
      await fs.access(outputPath);
      outputPath = path.join(
        outputDirectory,
        `${safeFileName} (${suffix}).pdf`
      );
      suffix += 1;
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
      break;
    }
  }

  return createPdf(event, outputPath, "printable document");
});

ipcMain.handle(
  "booking-documents:save-local",
  async (_event, bookingReference, documents) => {
    if (
      typeof bookingReference !== "string" ||
      !/^[A-Z0-9_-]{1,80}$/i.test(bookingReference)
    ) {
      throw new Error("A valid booking reference is required to save documents.");
    }
    if (
      !Array.isArray(documents) ||
      documents.length < 1 ||
      documents.length > 11
    ) {
      throw new Error("Between 1 and 11 booking documents are required.");
    }

    const outputRoot = await getPdfSaveDirectory(
      "booking-documents",
      path.join(
        app.getPath("documents"),
        "ESM Rest House",
        "Booking Documents"
      )
    );
    const bookingDirectory = path.join(
      outputRoot,
      sanitizePdfFileName(bookingReference)
    );
    await fs.mkdir(bookingDirectory, { recursive: true });

    const savedFiles = [];
    for (const document of documents) {
      if (
        !document ||
        !["BOOKING_PERSON", "OCCUPANT"].includes(document.personType) ||
        typeof document.personName !== "string" ||
        typeof document.mimeType !== "string" ||
        !(document.content instanceof Uint8Array) ||
        document.content.byteLength < 1 ||
        document.content.byteLength > 5 * 1024 * 1024
      ) {
        throw new Error("A booking document is invalid or exceeds the 5 MB limit.");
      }

      const extensions = {
        "application/pdf": "pdf",
        "image/jpeg": "jpg",
        "image/png": "png",
      };
      const extension = extensions[document.mimeType];
      if (!extension) {
        throw new Error("Only PDF, JPEG, and PNG documents can be saved.");
      }
      if (
        document.personType === "BOOKING_PERSON" &&
        document.documentIndex !== 0
      ) {
        throw new Error("The booking person's document index is invalid.");
      }
      if (
        document.personType === "OCCUPANT" &&
        (!Number.isInteger(document.documentIndex) ||
          document.documentIndex < 1 ||
          document.documentIndex > 10)
      ) {
        throw new Error("An occupant document index is invalid.");
      }

      const prefix =
        document.personType === "BOOKING_PERSON"
          ? "Booking Person"
          : `Occupant ${String(document.documentIndex).padStart(2, "0")}`;
      const personName = sanitizePdfFileName(document.personName).slice(0, 80);
      const outputPath = path.join(
        bookingDirectory,
        `${prefix} - ${personName}.${extension}`
      );
      await fs.writeFile(outputPath, Buffer.from(document.content));
      savedFiles.push(outputPath);
    }

    return { directory: bookingDirectory, files: savedFiles };
  }
);

ipcMain.handle("invoice:save-pdf", async (event, invoiceNumber) => {
  if (typeof invoiceNumber !== "string" || !/^\d{8}$/.test(invoiceNumber)) {
    throw new Error("A valid invoice number is required to save the invoice PDF.");
  }

  const outputDirectory = await getPdfSaveDirectory(
    "invoices",
    "C:\\ESM_INVOICE"
  );
  let outputPath = path.join(outputDirectory, `${invoiceNumber}.pdf`);
  try {
    await fs.access(outputPath);
    outputPath = path.join(outputDirectory, "Fresh Start", `${invoiceNumber}.pdf`);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  return createPdf(event, outputPath, "invoice");
});

ipcMain.handle("bill:save-pdf", async (event, billNumber) => {
  if (typeof billNumber !== "string" || !/^\d{8}$/.test(billNumber)) {
    throw new Error("A valid bill number is required to save the bill PDF.");
  }

  const outputDirectory = await getPdfSaveDirectory(
    "bills",
    "C:\\ESM_INVOICE"
  );
  let outputPath = path.join(outputDirectory, `${billNumber}.pdf`);
  try {
    await fs.access(outputPath);
    outputPath = path.join(outputDirectory, "Fresh Start", `${billNumber}.pdf`);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  return createPdf(event, outputPath, "bill");
});

ipcMain.handle("refund-memo:save-pdf", async (event, memoNumber) => {
  if (
    typeof memoNumber !== "string" ||
    !/^[A-Z0-9_-]{1,80}$/i.test(memoNumber)
  ) {
    throw new Error("A valid refund memo number is required to save the PDF.");
  }

  const outputDirectory = await getPdfSaveDirectory(
    "refund-memos",
    "C:\\ESM_REFUND"
  );
  const outputPath = path.join(outputDirectory, `${memoNumber}.pdf`);
  return createPdf(event, outputPath, "refund memo");
});

async function createWindow() {
  mainWindow = new BrowserWindow({
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

app.whenReady().then(async () => {
  if (app.isPackaged) {
    try {
      await startPackagedBackend();
    } catch (error) {
      console.error("Unable to start the packaged backend:", error);
      await dialog.showMessageBox({
        type: "error",
        title: "ESM Rest House could not start",
        message: error.message,
        detail:
          "Check that PostgreSQL is running and that the selected backend .env configuration is correct.",
      });
      app.quit();
      return;
    }
  }

  await createWindow();

  if (app.isPackaged && process.platform === "win32") {
    configureAutoUpdates();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
    backendProcess = undefined;
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});