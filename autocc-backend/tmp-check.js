const fs = require("fs");
const { execSync } = require("child_process");
// use exceljs can't read xls; use a quick approach with powershell COM if available, else dump via node buffer
const XLSX = (() => { try { return require("xlsx"); } catch { return null; } })();
if (!XLSX) {
  console.log("no xlsx pkg");
  process.exit(0);
}
