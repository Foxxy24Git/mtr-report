import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { LeaderClient, type LeaderRow } from "@/components/leader/LeaderClient";

export const dynamic = "force-dynamic";

export default async function LeaderPage() {
  const session = await requireSession();
  // Proteksi route: hanya Super Admin (selaras middleware/RBAC).
  if (session.role !== "superadmin") {
    redirect("/dashboard");
  }

  const leaders = await prisma.leader.findMany({
    orderBy: [{ kategori: "asc" }, { nama: "asc" }],
    select: {
      id: true,
      nama: true,
      jabatan: true,
      kategori: true,
      tipe: true,
      namaPjs: true,
      isAktif: true,
    },
  });

  return <LeaderClient initialLeaders={leaders as LeaderRow[]} />;
}
