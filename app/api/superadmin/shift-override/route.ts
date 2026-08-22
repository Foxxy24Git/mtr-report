import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isAkhirPekanWIB } from "@/lib/shift";
import { parseTanggal, todayKeyWIB } from "@/lib/suhuServer";

async function requireSuperAdmin() {
  const session = await getSession();
  if (!session) {
    return {
      denied: NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 }),
    };
  }
  if (session.role !== "superadmin") {
    return { denied: NextResponse.json({ error: "Akses ditolak." }, { status: 403 }) };
  }
  return { session, denied: null as null };
}

function serialize(item: {
  id: string;
  tanggal: Date;
  createdAt: Date;
  createdBy: { nama: string };
}) {
  return {
    id: item.id,
    tanggal: item.tanggal.toISOString().slice(0, 10),
    createdByNama: item.createdBy.nama,
    createdAt: item.createdAt.toISOString(),
  };
}

/**
 * GET /api/superadmin/shift-override — daftar tanggal aktivasi shift 12 jam
 * di hari kerja. Hanya Super Admin.
 */
export async function GET() {
  const auth = await requireSuperAdmin();
  if (auth.denied) return auth.denied;

  const items = await prisma.shiftOverride.findMany({
    orderBy: { tanggal: "desc" },
    include: { createdBy: { select: { nama: true } } },
  });
  return NextResponse.json({ items: items.map(serialize) });
}

/**
 * POST /api/superadmin/shift-override — aktifkan shift 12 jam (D/E) untuk
 * satu tanggal hari kerja (kondisi darurat: petugas sakit/izin, tanggal
 * merah). Hanya Super Admin.
 */
export async function POST(req: Request) {
  const auth = await requireSuperAdmin();
  if (auth.denied) return auth.denied;

  const body = await req.json().catch(() => null);
  const tanggalInput = typeof body?.tanggal === "string" ? body.tanggal.trim() : "";
  const tanggal = parseTanggal(tanggalInput);
  if (!tanggal) {
    return NextResponse.json(
      { error: "Tanggal wajib diisi (format YYYY-MM-DD)." },
      { status: 400 }
    );
  }
  if (isAkhirPekanWIB(tanggal)) {
    return NextResponse.json(
      { error: "Akhir pekan sudah otomatis shift 12 jam — tidak perlu diaktifkan." },
      { status: 400 }
    );
  }
  if (tanggalInput < todayKeyWIB()) {
    return NextResponse.json(
      { error: "Tidak bisa mengaktifkan untuk tanggal yang sudah lewat." },
      { status: 400 }
    );
  }

  try {
    const created = await prisma.shiftOverride.create({
      data: { tanggal, createdById: auth.session!.sub },
      include: { createdBy: { select: { nama: true } } },
    });
    return NextResponse.json({ item: serialize(created) }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "Shift 12 jam sudah aktif untuk tanggal ini." },
        { status: 409 }
      );
    }
    throw e;
  }
}
