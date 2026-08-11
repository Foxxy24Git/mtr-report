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
       * Petugas (role user) tetap read-only penuh di menu ini — mereka
       * mengelola tiket lewat Daily Monitoring. Supervisi JUGA dikecualikan
       * (readOnly=false) supaya bisa menambah Kegiatan Penanganan Gangguan
       * di sini — ini satu-satunya halaman yang bisa dibuka Supervisi untuk
       * tiket per-item, karena /daily-monitoring dibatasi role "user" saja
       * (lib/rbac.ts). AMAN: canMutate/canEditActivity di
       * TicketDetailClient tetap keras memblokir role supervisi terlepas
       * dari readOnly — hanya canAddActivity yang terbuka, dan itu pun
       * dipagari kepemilikan ticket.supervisiId.
       */
      readOnly={session.role === "user"}
      backHref="/weekly-monitoring"
      backLabel="Kembali ke Weekly Monitoring"
    />
  );
}
