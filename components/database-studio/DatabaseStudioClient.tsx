"use client";

import { useCallback, useEffect, useState } from "react";
import { Database, Pencil, Trash2, Search, ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";
import type { ColumnMeta } from "@/lib/dbStudio";
import { MASK_PLACEHOLDER } from "@/lib/dbStudio";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { Table, TableHead, TableBody, TableRow, Th, Td } from "@/components/ui/Table";

type Row = Record<string, unknown>;

interface TablesResponse {
  tables: { key: string; label: string }[];
}

interface RowsResponse {
  label: string;
  columns: ColumnMeta[];
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function DatabaseStudioClient({ currentUserId }: { currentUserId: string }) {
  const [tables, setTables] = useState<{ key: string; label: string }[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [data, setData] = useState<RowsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<string | undefined>(undefined);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [editing, setEditing] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);

  // Muat daftar tabel sekali.
  useEffect(() => {
    fetch("/api/superadmin/db")
      .then((r) => r.json())
      .then((d: TablesResponse) => {
        setTables(d.tables);
        if (d.tables.length > 0) setSelected(d.tables[0].key);
      })
      .catch(() => setError("Gagal memuat daftar tabel."));
  }, []);

  const fetchRows = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        sortDir,
      });
      if (sortBy) qs.set("sortBy", sortBy);
      if (search) qs.set("search", search);
      const res = await fetch(`/api/superadmin/db/${selected}?${qs.toString()}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Gagal memuat data.");
      setData(d as RowsResponse);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Gagal memuat data.");
    } finally {
      setLoading(false);
    }
  }, [selected, page, sortBy, sortDir, search]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  function changeTable(key: string) {
    setSelected(key);
    setPage(1);
    setSortBy(undefined);
    setSortDir("desc");
    setSearchInput("");
    setSearch("");
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  function toggleSort(col: string) {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
    setPage(1);
  }

  const columns = data?.columns ?? [];
  const idCol = columns.find((c) => c.isId)?.name ?? "id";
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Database className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Database Studio</h1>
          <p className="text-sm text-gray-500">
            Lihat & kelola data tabel langsung dari aplikasi. Setiap perubahan dicatat di audit log.
          </p>
        </div>
      </div>

      <Card padding="md">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full sm:w-64">
            <Select
              label="Tabel"
              value={selected}
              onChange={(e) => changeTable(e.target.value)}
            >
              {tables.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
          <form onSubmit={submitSearch} className="flex items-end gap-2 w-full sm:w-auto">
            <div className="flex-1 sm:w-64">
              <Input
                label="Cari"
                placeholder="Cari di kolom teks…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <Button type="submit" variant="secondary" className="mb-[1px]">
              <Search className="w-4 h-4" />
              Cari
            </Button>
          </form>
        </div>
      </Card>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Card padding="none">
        <Table>
          <TableHead>
            <tr>
              {columns.map((c) => (
                <Th
                  key={c.name}
                  className="cursor-pointer select-none"
                  onClick={() => toggleSort(c.name)}
                  title="Klik untuk urutkan"
                >
                  <span className="inline-flex items-center gap-1">
                    {c.name}
                    {c.masked && <span className="text-[10px] text-amber-500">🔒</span>}
                    <ArrowUpDown
                      className={
                        "w-3 h-3 " + (sortBy === c.name ? "text-primary" : "text-gray-300")
                      }
                    />
                  </span>
                </Th>
              ))}
              <Th className="text-right">Aksi</Th>
            </tr>
          </TableHead>
          <TableBody>
            {loading && (
              <TableRow>
                <Td colSpan={columns.length + 1} className="text-center text-gray-400 py-8">
                  Memuat…
                </Td>
              </TableRow>
            )}
            {!loading && data && data.rows.length === 0 && (
              <TableRow>
                <Td colSpan={columns.length + 1} className="text-center text-gray-400 py-8">
                  Tidak ada data.
                </Td>
              </TableRow>
            )}
            {!loading &&
              data?.rows.map((row) => (
                <TableRow key={String(row[idCol])}>
                  {columns.map((c) => (
                    <Td key={c.name} className="max-w-xs truncate" title={formatCell(row[c.name])}>
                      {formatCell(row[c.name])}
                    </Td>
                  ))}
                  <Td className="text-right whitespace-nowrap">
                    <div className="inline-flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:bg-red-50"
                        onClick={() => setDeleting(row)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </Td>
                </TableRow>
              ))}
          </TableBody>
        </Table>

        {data && (
          <div className="flex items-center justify-between px-4 py-3 text-sm text-gray-500">
            <span>
              {data.total} baris · halaman {data.page}/{totalPages}
            </span>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {editing && (
        <EditRowModal
          table={selected}
          columns={columns}
          row={editing}
          idCol={idCol}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void fetchRows();
          }}
        />
      )}

      {deleting && (
        <DeleteRowModal
          table={selected}
          row={deleting}
          idCol={idCol}
          currentUserId={currentUserId}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            void fetchRows();
          }}
        />
      )}
    </div>
  );
}

function initialForm(columns: ColumnMeta[], row: Row): Record<string, string> {
  const form: Record<string, string> = {};
  for (const c of columns) {
    const v = row[c.name];
    if (v === null || v === undefined) form[c.name] = "";
    else if (typeof v === "object") form[c.name] = JSON.stringify(v, null, 2);
    else form[c.name] = String(v);
  }
  return form;
}

function EditRowModal({
  table,
  columns,
  row,
  idCol,
  onClose,
  onSaved,
}: {
  table: string;
  columns: ColumnMeta[];
  row: Row;
  idCol: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Record<string, string>>(() => initialForm(columns, row));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      for (const c of columns) {
        if (c.editable) body[c.name] = form[c.name];
      }
      const res = await fetch(
        `/api/superadmin/db/${table}/${encodeURIComponent(String(row[idCol]))}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Gagal menyimpan.");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Edit baris" size="lg">
      <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
        {columns.map((c) => {
          const disabled = !c.editable;
          const label = `${c.name}${disabled ? c.masked ? " (terkunci)" : " (read-only)" : ""}`;

          if (c.editable && c.kind === "enum") {
            return (
              <Select
                key={c.name}
                label={label}
                value={form[c.name]}
                onChange={(e) => setForm((f) => ({ ...f, [c.name]: e.target.value }))}
              >
                {!c.required && <option value="">— kosong —</option>}
                {c.enumValues?.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </Select>
            );
          }

          if (c.editable && c.type === "Boolean") {
            return (
              <Select
                key={c.name}
                label={label}
                value={form[c.name]}
                onChange={(e) => setForm((f) => ({ ...f, [c.name]: e.target.value }))}
              >
                {!c.required && <option value="">— kosong —</option>}
                <option value="true">true</option>
                <option value="false">false</option>
              </Select>
            );
          }

          return (
            <Input
              key={c.name}
              label={label}
              value={c.masked ? MASK_PLACEHOLDER : form[c.name]}
              disabled={disabled}
              type={c.editable && (c.type === "Int" || c.type === "Float") ? "number" : "text"}
              hint={c.editable && c.type === "DateTime" ? "Format ISO, mis. 2026-06-02T10:00:00Z" : undefined}
              onChange={(e) => setForm((f) => ({ ...f, [c.name]: e.target.value }))}
            />
          );
        })}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={saving}>
          Batal
        </Button>
        <Button onClick={save} loading={saving}>
          Simpan
        </Button>
      </div>
    </Modal>
  );
}

function DeleteRowModal({
  table,
  row,
  idCol,
  currentUserId,
  onClose,
  onDeleted,
}: {
  table: string;
  row: Row;
  idCol: string;
  currentUserId: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rowId = String(row[idCol]);
  const isSelf = table === "users" && rowId === currentUserId;

  async function confirmDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/superadmin/db/${table}/${encodeURIComponent(rowId)}`, {
        method: "DELETE",
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Gagal menghapus.");
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menghapus.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Hapus baris" size="sm">
      {isSelf ? (
        <p className="text-sm text-gray-600">
          Anda tidak bisa menghapus akun yang sedang Anda gunakan.
        </p>
      ) : (
        <p className="text-sm text-gray-600">
          Yakin menghapus baris <span className="font-mono font-medium">{rowId}</span> dari{" "}
          <span className="font-medium">{table}</span>? Tindakan ini tidak bisa dibatalkan dan
          akan dicatat di audit log.
        </p>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={deleting}>
          Batal
        </Button>
        {!isSelf && (
          <Button variant="danger" onClick={confirmDelete} loading={deleting}>
            Hapus
          </Button>
        )}
      </div>
    </Modal>
  );
}
