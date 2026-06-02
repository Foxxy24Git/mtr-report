import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  getTableConfig,
  getColumns,
  delegateName,
  idColumn,
  sanitizeUpdate,
  maskRow,
} from "@/lib/dbStudio";
import { writeAuditLog } from "@/lib/audit";

type PrismaDelegate = {
  findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
  update: (args: unknown) => Promise<Record<string, unknown>>;
  delete: (args: unknown) => Promise<Record<string, unknown>>;
};

type Params = { params: Promise<{ table: string; id: string }> };

function getDelegate(model: string): PrismaDelegate {
  return (prisma as unknown as Record<string, PrismaDelegate>)[delegateName(model)];
}

/**
 * PATCH /api/superadmin/db/[table]/[id] — ubah satu baris. Hanya kolom editable
 * yang diterima; field read-only/masked diabaikan server-side. Setiap perubahan
 * dicatat ke audit_logs. Hanya Super Admin.
 */
export async function PATCH(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  if (session.role !== "superadmin") {
    return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  }

  const { table, id } = await params;
  const cfg = getTableConfig(table);
  if (!cfg) {
    return NextResponse.json({ error: "Tabel tidak ditemukan." }, { status: 404 });
  }

  const columns = getColumns(cfg);
  const idCol = idColumn(columns);
  const delegate = getDelegate(cfg.model);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const { data, errors } = sanitizeUpdate(columns, body);
  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join(" ") }, { status: 400 });
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Tidak ada field yang diubah." }, { status: 400 });
  }

  const before = await delegate.findUnique({ where: { [idCol]: id } });
  if (!before) {
    return NextResponse.json({ error: "Baris tidak ditemukan." }, { status: 404 });
  }

  try {
    const after = await delegate.update({ where: { [idCol]: id }, data });
    await writeAuditLog({
      userId: session.sub,
      username: session.username,
      action: "update",
      tableName: cfg.key,
      rowId: id,
      before,
      after,
    });
    return NextResponse.json({ row: maskRow(columns, after) });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "Nilai unik sudah dipakai baris lain." },
        { status: 409 }
      );
    }
    throw e;
  }
}

/**
 * DELETE /api/superadmin/db/[table]/[id] — hapus satu baris (dicatat ke
 * audit_logs). Super Admin tidak bisa menghapus akunnya sendiri. Pelanggaran
 * foreign key → 409 (baris masih direferensikan baris lain).
 */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  if (session.role !== "superadmin") {
    return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  }

  const { table, id } = await params;
  const cfg = getTableConfig(table);
  if (!cfg) {
    return NextResponse.json({ error: "Tabel tidak ditemukan." }, { status: 404 });
  }

  // Cegah Super Admin mengunci dirinya sendiri.
  if (cfg.model === "User" && id === session.sub) {
    return NextResponse.json(
      { error: "Tidak bisa menghapus akun yang sedang Anda gunakan." },
      { status: 400 }
    );
  }

  const columns = getColumns(cfg);
  const idCol = idColumn(columns);
  const delegate = getDelegate(cfg.model);

  const before = await delegate.findUnique({ where: { [idCol]: id } });
  if (!before) {
    return NextResponse.json({ error: "Baris tidak ditemukan." }, { status: 404 });
  }

  try {
    await delegate.delete({ where: { [idCol]: id } });
    await writeAuditLog({
      userId: session.sub,
      username: session.username,
      action: "delete",
      tableName: cfg.key,
      rowId: id,
      before,
      after: null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return NextResponse.json(
        { error: "Baris ini masih direferensikan baris lain dan tidak bisa dihapus." },
        { status: 409 }
      );
    }
    throw e;
  }
}
