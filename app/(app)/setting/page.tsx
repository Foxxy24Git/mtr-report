import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SettingClient } from "@/components/setting/SettingClient";
import type { Role } from "@/lib/roles";
import type { UserRow } from "@/components/setting/UserSection";
import type { LeaderRow } from "@/components/setting/LeaderSection";

export const dynamic = "force-dynamic";

export default async function SettingPage() {
  const session = await requireSession();
  const isAdmin = session.role === "superadmin";

  const [me, users, leaders] = await Promise.all([
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
    isAdmin
      ? prisma.user.findMany({
          orderBy: [{ role: "asc" }, { username: "asc" }],
          select: {
            id: true,
            username: true,
            nama: true,
            role: true,
            fotoProfilUrl: true,
            ttdUrl: true,
          },
        })
      : Promise.resolve(null),
    isAdmin
      ? prisma.leader.findMany({
          orderBy: [{ jabatan: "asc" }, { nama: "asc" }],
          select: { id: true, nama: true, jabatan: true, isPjs: true, aktif: true },
        })
      : Promise.resolve(null),
  ]);

  if (!me) {
    // Sesi valid tapi user terhapus — paksa login ulang.
    return null;
  }

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
      users={users as UserRow[] | null}
      leaders={leaders as LeaderRow[] | null}
    />
  );
}
