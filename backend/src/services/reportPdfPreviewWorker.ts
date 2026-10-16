import { pool } from "../config/db.js";
import { exportDailyReportPreview } from "./reportPdfExports.js";

const reportDate = process.argv[2];

if (!reportDate) {
  console.error("Usage: tsx src/services/reportPdfPreviewWorker.ts YYYY-MM-DD");
  process.exitCode = 1;
} else {
  try {
    const outputPath = await exportDailyReportPreview(reportDate);
    console.info(`Saved interim daily report PDF: ${outputPath}`);
  } catch (error) {
    console.error("Interim daily report PDF export failed:", error);
    process.exitCode = 1;
  }
}

await pool.end();
