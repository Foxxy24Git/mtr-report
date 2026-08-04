import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  resolvePeranApproval,
  hitungStatusLaporan,
} from "@/lib/shiftReportApproval";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/shift-reports/[id]/approve — Supervisi menyetujui satu laporan shift
 * (PART 3). Body opsional `{ catatan }`. Setelah approve, TTD supervisi otomatis
 * tampil di laporan Excel shift tersebut (di-gate status di lib/reportData.ts).
 */
export async function POST(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  if (session.role !== "supervisi") {
    return NextResponse.json(
      { error: "Hanya Supervisi yang dapat menyetujui laporan shift." },
      { status: 403 }
    );
  }

  const { id } = await params;

  let catatan: string | null = null;
  try {
    const body = (await req.json()) ?? {};
    if (typeof body.catatan === "string" && body.catatan.trim()) {
      catatan = body.catatan.trim();
    }
  } catch {
    /* tanpa body */
  }

  const report = await prisma.shiftReport.findUnique({ where: { id } });
  if (!report) {
    return NextResponse.json(
      { error: "Laporan shift tidak ditemukan." },
      { status: 404 }
    );
  }
  const peran = resolvePeranApproval(report, session.sub);
  if (!peran) {
    return NextResponse.json(
      { error: "Laporan ini bukan tanggung jawab supervisi Anda." },
      { status: 403 }
    );
  }

  const utamaSudah = report.approvedAt !== null;
  const nextSudah = report.supervisiNextApprovedAt !== null;
  const perluUtama = peran === "utama" || peran === "keduanya";
  const perluNext = peran === "selanjutnya" || peran === "keduanya";

  // Konflik dihitung PER PERAN, bukan per laporan: pada shift C/E laporan yang
  // sudah di-approve supervisi utama masih menunggu supervisi selanjutnya.
  if ((!perluUtama || utamaSudah) && (!perluNext || nextSudah)) {
    return NextResponse.json(
      { error: "Anda sudah menyetujui laporan shift ini." },
      { status: 409 }
    );
  }

  const now = new Date();
  const patch: Record<string, unknown> = {};
  if (perluUtama && !utamaSudah) {
    patch.approvedAt = now;
    patch.approvedById = session.sub;
    patch.catatanSupervisi = catatan;
  }
  if (perluNext && !nextSudah) {
    patch.supervisiNextApprovedAt = now;
    patch.supervisiNextApprovedById = session.sub;
    patch.catatanSupervisiNext = catatan;
  }

  // Status dihitung dari nilai BARU (bukan nilai lama hasil findUnique) supaya
  // approve terakhir langsung menutup laporan dalam satu update.
  patch.status = hitungStatusLaporan({
    shiftKode: report.shiftKode,
    supervisiNextId: report.supervisiNextId,
    approvedAt: (patch.approvedAt as Date | undefined) ?? report.approvedAt,
    supervisiNextApprovedAt:
      (patch.supervisiNextApprovedAt as Date | undefined) ??
      report.supervisiNextApprovedAt,
  });

  await prisma.shiftReport.update({ where: { id }, data: patch });

  return NextResponse.json({ ok: true, peran, status: patch.status });
}
