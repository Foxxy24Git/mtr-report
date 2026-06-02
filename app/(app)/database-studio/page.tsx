import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { DatabaseStudioClient } from "@/components/database-studio/DatabaseStudioClient";

export const dynamic = "force-dynamic";

export default async function DatabaseStudioPage() {
  const session = await requireSession();
  // Proteksi route: hanya Super Admin (selaras middleware/RBAC).
  if (session.role !== "superadmin") {
    redirect("/dashboard");
  }

  return <DatabaseStudioClient currentUserId={session.sub} />;
}
