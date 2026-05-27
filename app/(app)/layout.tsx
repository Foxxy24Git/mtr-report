import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { PageTransition } from "@/components/layout/PageTransition";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import type { ReactNode } from "react";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const me = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { fotoProfilUrl: true },
  });

  return (
    <div className="min-h-screen bg-surface-muted">
      <Sidebar role={session.role} />
      <Topbar
        user={{
          nama: session.nama,
          username: session.username,
          role: session.role,
          shift: session.shift,
          fotoProfilUrl: me?.fotoProfilUrl,
        }}
      />
      <main
        className="min-h-screen"
        style={{
          paddingLeft: "var(--sidebar-width)",
          paddingTop: "var(--topbar-height)",
        }}
      >
        <div className="p-6 max-w-screen-2xl mx-auto">
          <PageTransition>{children}</PageTransition>
        </div>
      </main>
    </div>
  );
}
