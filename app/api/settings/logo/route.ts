import { NextResponse } from "next/server";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { saveImageUpload } from "@/lib/upload";

const PUBLIC_DIR = join(process.cwd(), "public");

/** Baca nilai logo_url saat ini dari app_settings. */
async function currentLogoUrl(): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({
    where: { key: "logo_url" },
    select: { value: true },
  });
  return row?.value ?? null;
}

/** GET /api/settings/logo — publik (dipakai halaman login). */
export async function GET() {
  return NextResponse.json({ logo_url: await currentLogoUrl() });
}

/** POST /api/settings/logo — unggah logo baru (multipart, field "file"). Super Admin. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  if (session.role !== "superadmin") {
    return NextResponse.json(
      { error: "Hanya Super Admin yang dapat mengubah logo." },
      { status: 403 }
    );
  }

  const prev = await currentLogoUrl();
  const form = await req.formData().catch(() => null);
  const result = await saveImageUpload(form?.get("file"), "logo", session.sub, prev);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await prisma.appSetting.upsert({
    where: { key: "logo_url" },
    update: { value: result.url, updatedById: session.sub },
    create: { key: "logo_url", value: result.url, updatedById: session.sub },
  });

  return NextResponse.json({ url: result.url });
}

/** DELETE /api/settings/logo — hapus logo, kembali ke default. Super Admin. */
export async function DELETE() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  if (session.role !== "superadmin") {
    return NextResponse.json(
      { error: "Hanya Super Admin yang dapat mengubah logo." },
      { status: 403 }
    );
  }

  const prev = await currentLogoUrl();
  if (prev && prev.startsWith("/uploads/")) {
    await rm(join(PUBLIC_DIR, prev.replace(/^\//, "")), { force: true }).catch(
      () => {}
    );
  }

  await prisma.appSetting.upsert({
    where: { key: "logo_url" },
    update: { value: null, updatedById: session.sub },
    create: { key: "logo_url", value: null, updatedById: session.sub },
  });

  return NextResponse.json({ url: null });
}
