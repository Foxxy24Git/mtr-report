import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { DataVendorClient } from "@/components/data-vendor/DataVendorClient";

export const dynamic = "force-dynamic";

export default async function DataVendorPage() {
  const session = await requireSession();
  // Proteksi route: hanya Super Admin (selaras middleware/RBAC).
  if (session.role !== "superadmin") {
    redirect("/dashboard");
  }

  const vendors = await prisma.vendorMaster.findMany({
    orderBy: { nama: "asc" },
  });

  return <DataVendorClient initialItems={vendors} />;
}
