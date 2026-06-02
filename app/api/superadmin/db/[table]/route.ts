import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  getTableConfig,
  getColumns,
  delegateName,
  buildWhere,
  buildOrderBy,
  maskRow,
} from "@/lib/dbStudio";

/** Delegate Prisma generik (hanya operasi yang dipakai modul ini). */
type PrismaDelegate = {
  findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
  count: (args: unknown) => Promise<number>;
};

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

/**
 * GET /api/superadmin/db/[table] — baris tabel terpilih, ter-paginasi.
 * Query: page, pageSize, search, sortBy, sortDir. Hanya Super Admin.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ table: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  if (session.role !== "superadmin") {
    return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  }

  const { table } = await params;
  const cfg = getTableConfig(table);
  if (!cfg) {
    return NextResponse.json({ error: "Tabel tidak ditemukan." }, { status: 404 });
  }

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(url.searchParams.get("pageSize")) || DEFAULT_PAGE_SIZE)
  );
  const search = url.searchParams.get("search") ?? "";
  const sortBy = url.searchParams.get("sortBy") ?? undefined;
  const sortDir = url.searchParams.get("sortDir") ?? undefined;

  const columns = getColumns(cfg);
  const where = buildWhere(columns, search);
  const orderBy = buildOrderBy(columns, sortBy, sortDir);

  const delegate = (prisma as unknown as Record<string, PrismaDelegate>)[
    delegateName(cfg.model)
  ];

  const [rows, total] = await Promise.all([
    delegate.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    delegate.count({ where }),
  ]);

  return NextResponse.json({
    label: cfg.label,
    columns,
    rows: rows.map((r) => maskRow(columns, r)),
    total,
    page,
    pageSize,
  });
}
