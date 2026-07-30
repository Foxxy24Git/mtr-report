"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Check, X, Tags, Zap, Wrench } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

export type LookupTipe = "jenis_gangguan" | "sumber_penyebab" | "jenis_penanganan";

export interface LookupRow {
  id: string;
  tipe: LookupTipe;
  nilai: string;
}

const TABS: {
  tipe: LookupTipe;
  label: string;
  icon: typeof Tags;
  hint: string;
  placeholder: string;
}[] = [
  {
    tipe: "jenis_gangguan",
    label: "Jenis Gangguan",
    icon: Tags,
    hint: "Pilihan pada dropdown Jenis Gangguan di form Open Tiket.",
    placeholder: "cth. ATM tidak bisa transaksi",
  },
  {
    tipe: "sumber_penyebab",
    label: "Sumber Penyebab Gangguan",
    icon: Zap,
    hint: "Pilihan pada dropdown Sumber Penyebab Gangguan di form Open Tiket.",
    placeholder: "cth. Gangguan jaringan provider",
  },
  {
    tipe: "jenis_penanganan",
    label: "Metode Penanganan Gangguan",
    icon: Wrench,
    hint: "Pilihan pada dropdown Metode Penanganan Gangguan di form Open Tiket.",
    placeholder: "cth. Restart perangkat",
  },
];

export function DataGangguanClient({ initialItems }: { initialItems: LookupRow[] }) {
  const [items, setItems] = useState(initialItems);
  const [activeTipe, setActiveTipe] = useState<LookupTipe>("jenis_gangguan");

  // Form tambah
  const [addNilai, setAddNilai] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addErr, setAddErr] = useState("");

  // Edit inline
  const [editId, setEditId] = useState<string | null>(null);
  const [editNilai, setEditNilai] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState("");

  // Konfirmasi hapus
  const [delRow, setDelRow] = useState<LookupRow | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState("");

  const tab = TABS.find((t) => t.tipe === activeTipe)!;

  const counts = useMemo(() => {
    const c: Record<LookupTipe, number> = {
      jenis_gangguan: 0,
      sumber_penyebab: 0,
      jenis_penanganan: 0,
    };
    for (const it of items) c[it.tipe] += 1;
    return c;
  }, [items]);

  const rows = useMemo(
    () =>
      items
        .filter((it) => it.tipe === activeTipe)
        .sort((a, b) => a.nilai.localeCompare(b.nilai, "id")),
    [items, activeTipe]
  );

  function switchTab(tipe: LookupTipe) {
    setActiveTipe(tipe);
    setAddNilai("");
    setAddErr("");
    cancelEdit();
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddErr("");
    const nilai = addNilai.trim();
    if (!nilai) return setAddErr("Nilai wajib diisi.");

    setAddBusy(true);
    try {
      const res = await fetch("/api/master-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipe: activeTipe, nilai }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAddErr(data.error ?? "Gagal menambah nilai.");
        return;
      }
      setItems((prev) => [...prev, data.item as LookupRow]);
      setAddNilai("");
    } finally {
      setAddBusy(false);
    }
  }

  function startEdit(row: LookupRow) {
    setEditId(row.id);
    setEditNilai(row.nilai);
    setEditErr("");
  }
  function cancelEdit() {
    setEditId(null);
    setEditNilai("");
    setEditErr("");
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    setEditErr("");
    const nilai = editNilai.trim();
    if (!nilai) return setEditErr("Nilai tidak boleh kosong.");

    setEditBusy(true);
    try {
      const res = await fetch(`/api/master-lookup/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nilai }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditErr(data.error ?? "Gagal menyimpan perubahan.");
        return;
      }
      const saved = data.item as LookupRow;
      setItems((prev) => prev.map((it) => (it.id === saved.id ? saved : it)));
      cancelEdit();
    } finally {
      setEditBusy(false);
    }
  }

  async function confirmDelete() {
    if (!delRow) return;
    setDelErr("");
    setDelBusy(true);
    try {
      const res = await fetch(`/api/master-lookup/${delRow.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDelErr(data.error ?? "Gagal menghapus.");
        return;
      }
      setItems((prev) => prev.filter((it) => it.id !== delRow.id));
      setDelRow(null);
    } finally {
      setDelBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">Data Gangguan</h1>
        <p className="page-subtitle">
          Kelola pilihan dropdown pada form Open Tiket. Perubahan langsung terpakai
          pada tiket baru; tiket lama tidak terpengaruh.
        </p>
      </div>

      {/* Tab kategori */}
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = t.tipe === activeTipe;
          return (
            <button
              key={t.tipe}
              onClick={() => switchTab(t.tipe)}
              className={
                "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border transition-colors " +
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 " +
                (active
                  ? "bg-primary text-white border-primary shadow-sm"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-900")
              }
            >
              <Icon className="w-4 h-4" />
              {t.label}
              <span
                className={
                  "ml-1 px-1.5 py-0.5 text-xs rounded " +
                  (active ? "bg-white/20 text-white" : "bg-surface-subtle text-gray-500")
                }
              >
                {counts[t.tipe]}
              </span>
            </button>
          );
        })}
      </div>

      <Card padding="none">
        <div className="p-5 border-b border-gray-100">
          <CardTitle>{tab.label}</CardTitle>
          <p className="mt-0.5 text-sm text-gray-500">{tab.hint}</p>
        </div>

        {/* Tambah nilai baru */}
        <form
          onSubmit={submitAdd}
          className="p-5 border-b border-gray-100 bg-surface-muted/30"
        >
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <Input
                label="Tambah Nilai Baru"
                placeholder={tab.placeholder}
                value={addNilai}
                onChange={(e) => setAddNilai(e.target.value)}
              />
            </div>
            <Button type="submit" loading={addBusy}>
              <Plus className="w-4 h-4" /> Tambah
            </Button>
          </div>
          {addErr && (
            <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {addErr}
            </p>
          )}
        </form>

        {/* Daftar nilai */}
        <ul>
          {rows.length === 0 && (
            <li className="px-5 py-10 text-center text-sm text-gray-400">
              Belum ada nilai untuk kategori ini.
            </li>
          )}
          {rows.map((row) => (
            <li
              key={row.id}
              className="px-5 py-3 border-b border-gray-50 last:border-0 hover:bg-surface-muted/50 transition-colors"
            >
              {editId === row.id ? (
                <form onSubmit={submitEdit}>
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={editNilai}
                      onChange={(e) => setEditNilai(e.target.value)}
                      className="flex-1 px-3 py-2 text-sm rounded-md border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                    <Button type="submit" size="sm" loading={editBusy}>
                      <Check className="w-4 h-4" /> Simpan
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={cancelEdit}
                    >
                      <X className="w-4 h-4" /> Batal
                    </Button>
                  </div>
                  {editErr && (
                    <p className="mt-2 text-xs text-red-600">{editErr}</p>
                  )}
                </form>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-800">{row.nilai}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => startEdit(row)}
                      className="p-1.5 rounded-md text-gray-500 hover:text-primary hover:bg-primary-50 transition-colors"
                      aria-label={`Ubah ${row.nilai}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setDelErr("");
                        setDelRow(row);
                      }}
                      className="p-1.5 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                      aria-label={`Hapus ${row.nilai}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {/* Konfirmasi hapus */}
      <Modal
        open={delRow !== null}
        onClose={() => setDelRow(null)}
        title="Hapus Nilai?"
        size="sm"
      >
        <p className="text-sm text-gray-600">
          <span className="font-medium text-gray-800">{delRow?.nilai}</span> akan
          dihapus dari kategori {tab.label} dan tidak lagi muncul di dropdown Open
          Tiket. Tiket lama yang memakai nilai ini tetap aman.
        </p>
        {delErr && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {delErr}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="secondary" onClick={() => setDelRow(null)}>
            Batal
          </Button>
          <Button variant="danger" loading={delBusy} onClick={confirmDelete}>
            <Trash2 className="w-4 h-4" /> Hapus
          </Button>
        </div>
      </Modal>
    </div>
  );
}
