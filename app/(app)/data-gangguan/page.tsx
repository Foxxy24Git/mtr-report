import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  DataGangguanClient,
  type LookupRow,
} from "@/components/data-gangguan/DataGangguanClient";

export const dynamic = "force-dynamic";

export default async function DataGangguanPage() {
  const session = await requireSession();
  // Proteksi route: Super Admin & Monitoring saja (selaras middleware/RBAC).
  if (session.role !== "superadmin" && session.role !== "user") {
    redirect("/dashboard");
  }

  const items = await prisma.masterLookup.findMany({
    orderBy: [{ tipe: "asc" }, { nilai: "asc" }],
    select: { id: true, tipe: true, nilai: true },
  });

  return <DataGangguanClient initialItems={items as LookupRow[]} />;
}
