import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

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
  if (report.supervisiId !== session.sub) {
    return NextResponse.json(
      { error: "Laporan ini bukan tanggung jawab supervisi Anda." },
      { status: 403 }
    );
  }
  if (report.status === "approved") {
    return NextResponse.json(
      { error: "Laporan shift sudah disetujui." },
      { status: 409 }
    );
  }

  await prisma.shiftReport.update({
    where: { id },
    data: {
      status: "approved",
      approvedAt: new Date(),
      approvedById: session.sub,
      catatanSupervisi: catatan,
    },
  });

  return NextResponse.json({ ok: true });
}
