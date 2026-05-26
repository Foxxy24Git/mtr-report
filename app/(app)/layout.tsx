import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { requireSession } from "@/lib/session";
import type { ReactNode } from "react";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();

  return (
    <div className="min-h-screen bg-surface-muted">
      <Sidebar role={session.role} />
      <Topbar
        user={{
          nama: session.nama,
          username: session.username,
          role: session.role,
          shift: session.shift,
        }}
      />
      <main
        className="min-h-screen"
        style={{
          paddingLeft: "var(--sidebar-width)",
          paddingTop: "var(--topbar-height)",
        }}
      >
        <div className="p-6 max-w-screen-2xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
