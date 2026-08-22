import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getLogoUrl } from "@/lib/appSettings";
import { SettingClient } from "@/components/setting/SettingClient";
import type { Role } from "@/lib/roles";
import type { ShiftOverrideRow } from "@/components/setting/Shift12JamSection";

export const dynamic = "force-dynamic";

export default async function SettingPage() {
  const session = await requireSession();

  const [me, logoUrl, shiftOverrideRows] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.sub },
      select: {
        username: true,
        nama: true,
        role: true,
        fotoProfilUrl: true,
        ttdUrl: true,
        createdAt: true,
      },
    }),
    getLogoUrl(),
    // Hanya dipakai tab "Shift 12 Jam" (Super Admin) — query murah, aman
    // di-skip untuk role lain lewat cek di bawah tanpa menambah query kedua.
    session.role === "superadmin"
      ? prisma.shiftOverride.findMany({
          orderBy: { tanggal: "desc" },
          include: { createdBy: { select: { nama: true } } },
        })
      : Promise.resolve([]),
  ]);

  if (!me) {
    // Sesi valid tapi user terhapus — paksa login ulang.
    return null;
  }

  const shiftOverrides: ShiftOverrideRow[] = shiftOverrideRows.map((row) => ({
    id: row.id,
    tanggal: row.tanggal.toISOString().slice(0, 10),
    createdByNama: row.createdBy.nama,
    createdAt: row.createdAt.toISOString(),
  }));

  return (
    <SettingClient
      me={{
        username: me.username,
        nama: me.nama,
        role: me.role as Role,
        fotoProfilUrl: me.fotoProfilUrl,
        ttdUrl: me.ttdUrl,
        createdAt: me.createdAt.toISOString(),
      }}
      logoUrl={logoUrl}
      shiftOverrides={shiftOverrides}
    />
  );
}
