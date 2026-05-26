import { notFound } from "next/navigation";
import { LeaderJabatan, Role } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getTicketDetail } from "@/lib/ticketQueries";
import { ALL_SHIFTS } from "@/lib/shift";
import { TicketDetailClient } from "@/components/daily-monitoring/TicketDetailClient";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export default async function TicketDetailPage({ params }: Params) {
  const { id } = await params;
  const session = await requireSession();

  const ticket = await getTicketDetail(id);
  if (!ticket) notFound();

  const [lookups, leaders, petugas] = await Promise.all([
    prisma.masterLookup.findMany({
      orderBy: { nilai: "asc" },
      select: { tipe: true, nilai: true },
    }),
    prisma.leader.findMany({ where: { aktif: true }, orderBy: { nama: "asc" } }),
    prisma.user.findMany({
      where: { role: { in: [Role.user, Role.superadmin] } },
      orderBy: { nama: "asc" },
      select: { id: true, nama: true, username: true },
    }),
  ]);

  const opsi = {
    jenis_gangguan: [] as string[],
    sumber_penyebab: [] as string[],
    jenis_penanganan: [] as string[],
  };
  for (const l of lookups) opsi[l.tipe].push(l.nilai);

  const mapLeader = (j: LeaderJabatan) =>
    leaders
      .filter((l) => l.jabatan === j)
      .map((l) => ({ id: l.id, nama: l.nama, isPjs: l.isPjs }));

  return (
    <TicketDetailClient
      initialTicket={ticket}
      opsi={opsi}
      leadersInfra={mapLeader(LeaderJabatan.infrastruktur)}
      leadersDivisi={mapLeader(LeaderJabatan.divisi)}
      petugas={petugas}
      shifts={ALL_SHIFTS}
      role={session.role}
      currentUserId={session.sub}
      currentShift={session.shift}
    />
  );
}
