import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { saveImageUpload } from "@/lib/upload";

/** POST /api/me/ttd — unggah/ubah tanda tangan digital (multipart, field "file"). */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const current = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { ttdUrl: true },
  });

  const form = await req.formData().catch(() => null);
  const result = await saveImageUpload(
    form?.get("file"),
    "ttd",
    session.sub,
    current?.ttdUrl
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await prisma.user.update({
    where: { id: session.sub },
    data: { ttdUrl: result.url },
  });

  return NextResponse.json({ url: result.url });
}
