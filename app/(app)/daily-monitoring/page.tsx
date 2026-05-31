import { requireSession } from "@/lib/session";
import { listTickets } from "@/lib/ticketQueries";
import { ALL_SHIFTS } from "@/lib/shift";
import { prisma } from "@/lib/prisma";
import { DailyMonitoringClient } from "@/components/daily-monitoring/DailyMonitoringClient";

export const dynamic = "force-dynamic";

export default async function DailyMonitoringPage() {
  const session = await requireSession();
  // Pimpinan, supervisi & petugas penerima untuk modal serah terima (PRD revisi §1/§2).
  const [items, leaders, supervisiUsers, petugasUsers, me] = await Promise.all([
    listTickets({
      currentUserId: session.sub,
      dailyMonitoring: true,
      currentShift: session.shift,
      shiftStartedAt: session.shiftStartedAt,
    }),
    prisma.leader.findMany({
      where: { aktif: true },
      orderBy: { nama: "asc" },
      select: { id: true, nama: true, jabatan: true },
    }),
    prisma.user.findMany({
      where: { role: "supervisi" },
      orderBy: { nama: "asc" },
      select: { id: true, nama: true },
    }),
    // Petugas penerima shift: role=user (mtr1–mtr5), klien mengecualikan diri sendiri.
    prisma.user.findMany({
      where: { role: "user" },
      orderBy: { username: "asc" },
      select: { id: true, nama: true },
    }),
    prisma.user.findUnique({
      where: { id: session.sub },
      select: { ttdUrl: true },
    }),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">Daily Monitoring</h1>
        <p className="page-subtitle">
          Tiket aktif pada shift Anda saat ini — tiket yang Anda buka sendiri
          dan tiket tindak lanjut dari shift sebelumnya. Klik baris untuk
          membuka detail &amp; mencatat kegiatan penanganan.
        </p>
      </div>
      <DailyMonitoringClient
        initialItems={items}
        shifts={ALL_SHIFTS}
        role={session.role}
        currentShift={session.shift}
        leaders={leaders}
        supervisiUsers={supervisiUsers}
        petugasUsers={petugasUsers}
        currentUserId={session.sub}
        currentUserHasTtd={Boolean(me?.ttdUrl)}
      />
    </div>
  );
}
