import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getTicketDetail } from "@/lib/ticketQueries";
import { TicketDetailClient } from "@/components/daily-monitoring/TicketDetailClient";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export default async function WeeklyTicketDetailPage({ params }: Params) {
  const { id } = await params;
  const session = await requireSession();

  const ticket = await getTicketDetail(id);
  if (!ticket) notFound();

  const lookups = await prisma.masterLookup.findMany({
    orderBy: { nilai: "asc" },
    select: { tipe: true, nilai: true },
  });

  const opsi = {
    jenis_gangguan: [] as string[],
    sumber_penyebab: [] as string[],
    jenis_penanganan: [] as string[],
  };
  for (const l of lookups) opsi[l.tipe].push(l.nilai);

  return (
    <TicketDetailClient
      initialTicket={ticket}
      opsi={opsi}
      role={session.role}
      currentUserId={session.sub}
      currentSessionShift={session.shift}
      /**
       * Weekly Monitoring pada dasarnya menu tinjauan (read-only). Super Admin
       * dikecualikan agar punya satu tempat untuk override human error:
       * reopen tiket yang salah di-close, koreksi detail, dan hapus tiket.
       * Role lain (user & supervisi) tetap read-only penuh di menu ini —
       * mereka mengelola tiket lewat Daily Monitoring.
       */
      readOnly={session.role !== "superadmin"}
      backHref="/weekly-monitoring"
      backLabel="Kembali ke Weekly Monitoring"
    />
  );
}
