import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  ManajemenAkunClient,
  type AkunRow,
} from "@/components/manajemen-akun/ManajemenAkunClient";

export const dynamic = "force-dynamic";

type SearchParams = { searchParams: Promise<{ edit?: string }> };

export default async function ManajemenAkunPage({ searchParams }: SearchParams) {
  const session = await requireSession();
  // Proteksi route: hanya Super Admin (selaras middleware/RBAC).
  if (session.role !== "superadmin") {
    redirect("/dashboard");
  }

  const { edit } = await searchParams;

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { username: "asc" }],
    select: {
      id: true,
      username: true,
      nama: true,
      role: true,
      fotoProfilUrl: true,
      ttdUrl: true,
      isAktif: true,
    },
  });

  return (
    <ManajemenAkunClient
      initialUsers={users as AkunRow[]}
      currentUserId={session.sub}
      editId={edit ?? null}
    />
  );
}
