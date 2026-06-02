import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { saveImageUpload } from "@/lib/upload";

type Params = { params: Promise<{ id: string }> };

/** POST /api/users/[id]/ttd — Super Admin unggah tanda tangan akun lain. */
export async function POST(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  if (session.role !== "superadmin") {
    return NextResponse.json({ error: "Hanya Super Admin." }, { status: 403 });
  }

  const { id } = await params;
  const current = await prisma.user.findUnique({
    where: { id },
    select: { ttdUrl: true },
  });
  if (!current) {
    return NextResponse.json({ error: "Akun tidak ditemukan." }, { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  const result = await saveImageUpload(form?.get("file"), "ttd", id, current.ttdUrl);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await prisma.user.update({
    where: { id },
    data: { ttdUrl: result.url },
  });

  return NextResponse.json({ url: result.url });
}
