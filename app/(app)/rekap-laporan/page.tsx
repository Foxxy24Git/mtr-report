import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { todayKeyWIB } from "@/lib/suhuServer";
import { RekapLaporanClient } from "@/components/rekap/RekapLaporanClient";

export const dynamic = "force-dynamic";

export default async function RekapLaporanPage() {
  const session = await requireSession();
  const isSuperadmin = session.role === "superadmin";

  // Daftar petugas untuk dropdown per-user (hanya relevan bagi superadmin).
  const users = isSuperadmin
    ? await prisma.user.findMany({
        where: { role: Role.user },
        orderBy: { nama: "asc" },
        select: { id: true, nama: true },
      })
    : [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">Rekap Laporan</h1>
        <p className="page-subtitle">
          Unduh laporan harian penanganan gangguan dalam format Excel identik Form
          OPS-001 — lengkap logo Bank Nagari, blok suhu AC, log server, & tanda
          tangan.
        </p>
      </div>
      <RekapLaporanClient
        today={todayKeyWIB()}
        isSuperadmin={isSuperadmin}
        currentUser={{ id: session.sub, nama: session.nama }}
        users={users}
      />
    </div>
  );
}
