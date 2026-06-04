// Orkestrasi DB "Download Laporan Lengkap" (Fase 3).
//
// Menggabungkan dataset Fase 2 (gatherLaporanLengkap) dengan blok tanda tangan
// yang dipilih di MODAL (Fase 1) — supervisi + pimpinan/PJS Infra & Divisi —
// lalu memanggil generator Excel (lib/excelReportLengkap.ts). Berbeda dari
// laporan harian, penanda tangan TIDAK diambil dari shift_reports.

import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveLeaderName } from "@/lib/reportSignatures";
import { resolveReportLogoPath } from "@/lib/appSettings";
import { gatherLaporanLengkap } from "@/lib/reportLengkapData";
import {
  buildLengkapWorkbook,
  buildPeriodeLabel,
  fmtTanggalIndo,
} from "@/lib/excelReportLengkap";

export interface BuildLengkapParams {
  tanggalDari: string; // YYYY-MM-DD (WIB)
  tanggalSampai: string; // YYYY-MM-DD (WIB)
  supervisiId: string;
  pimpinanInfraId: string;
  pimpinanDivisiId: string;
}

export interface BuildLengkapResult {
  buffer: Buffer;
  filename: string;
  count: number;
}

/** Bangun .xlsx rekap gabungan untuk satu rentang + blok TTD pilihan modal. */
export async function buildLaporanLengkapExcel(
  p: BuildLengkapParams
): Promise<BuildLengkapResult> {
  const [{ tickets, count }, supervisi, infra, divisi, logoPath] =
    await Promise.all([
      gatherLaporanLengkap({
        tanggalDari: p.tanggalDari,
        tanggalSampai: p.tanggalSampai,
      }),
      prisma.user.findUnique({
        where: { id: p.supervisiId },
        select: { nama: true, ttdUrl: true },
      }),
      prisma.leader.findUnique({
        where: { id: p.pimpinanInfraId },
        select: { nama: true, tipe: true, namaPjs: true },
      }),
      prisma.leader.findUnique({
        where: { id: p.pimpinanDivisiId },
        select: { nama: true, tipe: true, namaPjs: true },
      }),
      resolveReportLogoPath(),
    ]);

  const buffer = await buildLengkapWorkbook({
    periodeLabel: buildPeriodeLabel(p.tanggalDari, p.tanggalSampai),
    // "Padang, …" memakai tanggal akhir rentang (tanggal cetak rekap).
    tanggalLabel: fmtTanggalIndo(p.tanggalSampai),
    tickets,
    signatures: {
      supervisi: supervisi?.nama ?? "",
      supervisiTtdPath: supervisi?.ttdUrl ?? null,
      // PJS → nama_pjs (PART 5), pimpinan tetap → nama.
      pimpinanInfra: resolveLeaderName(infra),
      pimpinanDivisi: resolveLeaderName(divisi),
    },
    logoPath: logoPath ?? undefined,
  });

  const filename = `REKAP_LAPORAN_LENGKAP_${p.tanggalDari}_sd_${p.tanggalSampai}.xlsx`;
  return { buffer, filename, count };
}
