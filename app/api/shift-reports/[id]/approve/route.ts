import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  resolvePeranApproval,
  cekKonflikApproval,
  susunPatchApproval,
} from "@/lib/shiftReportApproval";
import { notifyReportPending } from "@/lib/telegramScheduler";

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

  // Transaksi + row lock (FOR UPDATE): supervisi utama dan supervisi selanjutnya
  // bisa menekan approve nyaris bersamaan. Tanpa lock, kedua request membaca
  // snapshot approvedAt/supervisiNextApprovedAt yang sama-sama basi — masing-
  // masing melihat kolom milik PERAN LAIN masih null — lalu masing-masing
  // menghitung & menulis status "pending" dari sudut pandang basi itu. Kedua
  // update tetap tercatat (kolomnya disjoint), tapi laporan macet di status
  // "pending" selamanya walau kedua approval sudah ada di DB, karena approve
  // berikutnya langsung kena 409 (lihat catatan review Task 6). Lock memaksa
  // request kedua menunggu request pertama commit, lalu membaca ULANG nilai
  // yang sudah ter-update sebelum menghitung status.
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM shift_reports WHERE id = ${id} FOR UPDATE`;

    // Baca ulang SETELAH lock didapat — snapshot inilah yang dipakai untuk
    // pengecekan konflik & penulisan, BUKAN `report` hasil findUnique sebelum
    // transaksi (yang sudah bisa basi begitu request lain commit lebih dulu).
    const fresh = await tx.shiftReport.findUniqueOrThrow({ where: { id } });

    // Konflik dihitung PER PERAN, bukan per laporan: pada shift C/E laporan yang
    // sudah di-approve supervisi utama masih menunggu supervisi selanjutnya.
    if (cekKonflikApproval(peran, fresh)) {
      return { kind: "conflict" as const };
    }

    const patch = susunPatchApproval(peran, fresh, session.sub, catatan, new Date());
    await tx.shiftReport.update({ where: { id }, data: patch });

    return { kind: "ok" as const, status: patch.status };
  });

  if (result.kind === "conflict") {
    return NextResponse.json(
      { error: "Anda sudah menyetujui laporan shift ini." },
      { status: 409 }
    );
  }

  // Masih ada peran yang belum approve (shift malam) → ingatkan sekarang juga.
  // Dibungkus try/catch: kegagalan Telegram tidak boleh menggagalkan approve.
  if (result.status === "pending") {
    try {
      await notifyReportPending(id);
    } catch (err) {
      console.error("[telegram] Gagal kirim notif sisa approval:", err);
    }
  }

  return NextResponse.json({ ok: true, peran, status: result.status });
}
