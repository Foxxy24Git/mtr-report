import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getLogoUrl } from "@/lib/appSettings";
import { SettingClient } from "@/components/setting/SettingClient";
import type { Role } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function SettingPage() {
  const session = await requireSession();

  const [me, logoUrl] = await Promise.all([
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
      logoUrl={logoUrl}
    />
  );
}
