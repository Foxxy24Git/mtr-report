import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getTicketDetail } from "@/lib/ticketQueries";
import { TicketDetailClient } from "@/components/daily-monitoring/TicketDetailClient";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export default async function TicketDetailPage({ params }: Params) {
  const { id } = await params;
  const session = await requireSession();

  const ticket = await getTicketDetail(id);
  if (!ticket) notFound();

  const [lookups, vendors] = await Promise.all([
    prisma.masterLookup.findMany({
      orderBy: { nilai: "asc" },
      select: { tipe: true, nilai: true },
    }),
    prisma.vendorMaster.findMany({
      orderBy: { nama: "asc" },
      select: { nama: true },
    }),
  ]);

  const opsi = {
    jenis_gangguan: [] as string[],
    sumber_penyebab: [] as string[],
    jenis_penanganan: [] as string[],
    vendor: vendors.map((vendor) => vendor.nama),
  };
  for (const l of lookups) opsi[l.tipe].push(l.nilai);

  return (
    <TicketDetailClient
      initialTicket={ticket}
      opsi={opsi}
      role={session.role}
      currentUserId={session.sub}
      currentSessionShift={session.shift}
    />
  );
}
