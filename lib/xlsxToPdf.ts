// Konversi buffer .xlsx ke .pdf via LibreOffice headless, supaya hasil PDF
// identik dengan file Excel yang sudah dibangun (lib/excelReport.ts) — bukan
// render ulang layout di library lain. LibreOffice membaca page setup
// (orientation, fitToPage, printArea) yang sudah di-set di workbook.

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SOFFICE_BIN = process.env.SOFFICE_BIN || "soffice";
const CONVERT_TIMEOUT_MS = 60_000;

function runSoffice(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(SOFFICE_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Konversi PDF timeout (LibreOffice tidak merespons)."));
    }, CONVERT_TIMEOUT_MS);

    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Gagal menjalankan LibreOffice (${SOFFICE_BIN}): ${err.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`LibreOffice keluar dengan kode ${code}: ${stderr.trim()}`));
    });
  });
}

/**
 * Tiap panggilan pakai folder kerja & profile LibreOffice terisolasi
 * (mkdtemp) supaya request paralel tidak rebutan lock profile — tanpa ini,
 * instance `soffice` kedua yang jalan bersamaan akan gagal start.
 */
export async function convertXlsxToPdf(xlsx: Buffer): Promise<Buffer> {
  const workDir = await mkdtemp(join(tmpdir(), "mtr-xlsx2pdf-"));
  const profileDir = join(workDir, "profile");
  const inputPath = join(workDir, "input.xlsx");
  try {
    await writeFile(inputPath, xlsx);
    await runSoffice([
      "--headless",
      "--norestore",
      `-env:UserInstallation=file://${profileDir}`,
      "--convert-to",
      "pdf",
      "--outdir",
      workDir,
      inputPath,
    ]);
    return await readFile(join(workDir, "input.pdf"));
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
