"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Building2, Network } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";

export type LeaderKategori = "infrastruktur" | "divisi";
export type LeaderTipe = "tetap" | "pjs";

export interface LeaderRow {
  id: string;
  nama: string;
  jabatan: string;
  kategori: LeaderKategori;
  tipe: LeaderTipe;
  namaPjs: string | null;
  isAktif: boolean;
}

type FormState = {
  nama: string;
  jabatan: string;
  kategori: LeaderKategori;
  tipe: LeaderTipe;
  namaPjs: string;
  isAktif: boolean;
};

function emptyForm(kategori: LeaderKategori): FormState {
  return {
    nama: "",
    jabatan:
      kategori === "infrastruktur"
        ? "Pemimpin Bagian Infrastruktur TI"
        : "Pemimpin Divisi TI",
    kategori,
    tipe: "tetap",
    namaPjs: "",
    isAktif: true,
  };
}

export function LeaderClient({ initialLeaders }: { initialLeaders: LeaderRow[] }) {
  const [leaders, setLeaders] = useState(initialLeaders);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm("infrastruktur"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Konfirmasi hapus
  const [delId, setDelId] = useState<string | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState("");

  const infra = leaders.filter((l) => l.kategori === "infrastruktur");
  const divisi = leaders.filter((l) => l.kategori === "divisi");

  function openAdd(kategori: LeaderKategori) {
    setEditingId(null);
    setForm(emptyForm(kategori));
    setError("");
    setOpen(true);
  }
  function openEdit(l: LeaderRow) {
    setEditingId(l.id);
    setForm({
      nama: l.nama,
      jabatan: l.jabatan,
      kategori: l.kategori,
      tipe: l.tipe,
      namaPjs: l.namaPjs ?? "",
      isAktif: l.isAktif,
    });
    setError("");
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.nama.trim()) return setError("Nama pimpinan wajib diisi.");
    if (!form.jabatan.trim()) return setError("Jabatan wajib diisi.");
    if (form.tipe === "pjs" && !form.namaPjs.trim())
      return setError("Nama PJS wajib diisi bila tipe PJS.");

    setBusy(true);
    try {
      const payload = {
        nama: form.nama.trim(),
        jabatan: form.jabatan.trim(),
        kategori: form.kategori,
        tipe: form.tipe,
        namaPjs: form.tipe === "pjs" ? form.namaPjs.trim() : null,
        isAktif: form.isAktif,
      };
      const res = await fetch(
        editingId ? `/api/leaders/${editingId}` : "/api/leaders",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Gagal menyimpan pimpinan.");
        return;
      }
      const saved: LeaderRow = data.leader;
      setLeaders((prev) =>
        editingId
          ? prev.map((l) => (l.id === saved.id ? saved : l))
          : [...prev, saved]
      );
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function toggleAktif(l: LeaderRow) {
    const res = await fetch(`/api/leaders/${l.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isAktif: !l.isAktif }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setLeaders((prev) => prev.map((x) => (x.id === l.id ? data.leader : x)));
    } else {
      alert(data.error ?? "Gagal mengubah status.");
    }
  }

  async function confirmDelete() {
    if (!delId) return;
    setDelErr("");
    setDelBusy(true);
    try {
      const res = await fetch(`/api/leaders/${delId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDelErr(data.error ?? "Gagal menghapus.");
        return;
      }
      setLeaders((prev) => prev.filter((l) => l.id !== delId));
      setDelId(null);
    } finally {
      setDelBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">Leader</h1>
        <p className="page-subtitle">
          Kelola daftar pimpinan penanda tangan laporan. Tandai PJS untuk pejabat
          pengganti sementara.
        </p>
      </div>

      <div className="space-y-6">
        <LeaderSectionTable
          title="Pimpinan Bag. Infrastruktur TI"
          icon={<Building2 className="w-4 h-4 text-primary" />}
          rows={infra}
          onAdd={() => openAdd("infrastruktur")}
          onEdit={openEdit}
          onToggle={toggleAktif}
          onDelete={(id) => {
            setDelErr("");
            setDelId(id);
          }}
        />
        <LeaderSectionTable
          title="Pimpinan Divisi TI"
          icon={<Network className="w-4 h-4 text-primary" />}
          rows={divisi}
          onAdd={() => openAdd("divisi")}
          onEdit={openEdit}
          onToggle={toggleAktif}
          onDelete={(id) => {
            setDelErr("");
            setDelId(id);
          }}
        />
      </div>

      {/* Add / Edit modal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editingId ? "Ubah Pimpinan" : "Tambah Pimpinan"}
      >
        <form onSubmit={submit} className="space-y-4">
          <p className="text-xs text-gray-500">
            Kategori:{" "}
            <span className="font-medium text-gray-700">
              {form.kategori === "infrastruktur"
                ? "Bag. Infrastruktur TI"
                : "Divisi TI"}
            </span>
          </p>

          <Input
            label="Nama Pimpinan"
            required
            value={form.nama}
            onChange={(e) => setForm({ ...form, nama: e.target.value })}
          />
          <Input
            label="Jabatan"
            required
            placeholder="Pemimpin Bagian Infrastruktur TI"
            value={form.jabatan}
            onChange={(e) => setForm({ ...form, jabatan: e.target.value })}
          />

          <div>
            <span className="block text-sm font-medium text-gray-700 mb-1.5">
              Tipe
            </span>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="tipe"
                  checked={form.tipe === "tetap"}
                  onChange={() => setForm({ ...form, tipe: "tetap" })}
                  className="w-4 h-4 text-primary focus:ring-primary"
                />
                Pimpinan Tetap
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="tipe"
                  checked={form.tipe === "pjs"}
                  onChange={() => setForm({ ...form, tipe: "pjs" })}
                  className="w-4 h-4 text-primary focus:ring-primary"
                />
                PJS (Pengganti Sementara)
              </label>
            </div>
          </div>

          {form.tipe === "pjs" && (
            <Input
              label="Nama PJS"
              required
              placeholder="Nama orang yang menjadi PJS"
              value={form.namaPjs}
              onChange={(e) => setForm({ ...form, namaPjs: e.target.value })}
            />
          )}

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isAktif}
              onChange={(e) => setForm({ ...form, isAktif: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            Status Aktif (muncul di pilihan serah terima & laporan)
          </label>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button type="submit" loading={busy}>
              {editingId ? "Simpan" : "Tambah"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete confirm */}
      <Modal
        open={delId !== null}
        onClose={() => setDelId(null)}
        title="Hapus Pimpinan?"
        size="sm"
      >
        <p className="text-sm text-gray-600">
          Pimpinan akan dihapus permanen. Jika masih dipakai di tiket/serah terima,
          nonaktifkan saja lewat tombol status.
        </p>
        {delErr && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {delErr}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="secondary" onClick={() => setDelId(null)}>
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

function LeaderSectionTable({
  title,
  icon,
  rows,
  onAdd,
  onEdit,
  onToggle,
  onDelete,
}: {
  title: string;
  icon: React.ReactNode;
  rows: LeaderRow[];
  onAdd: () => void;
  onEdit: (l: LeaderRow) => void;
  onToggle: (l: LeaderRow) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Card padding="none">
      <div className="flex items-center justify-between p-5 border-b border-gray-100">
        <CardTitle className="flex items-center gap-2">
          {icon} {title}
        </CardTitle>
        <Button size="sm" onClick={onAdd}>
          <Plus className="w-4 h-4" /> Tambah Pimpinan
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
              <th className="px-5 py-2.5 font-medium">Nama</th>
              <th className="px-5 py-2.5 font-medium">Jabatan</th>
              <th className="px-5 py-2.5 font-medium">Tipe</th>
              <th className="px-5 py-2.5 font-medium">Nama PJS</th>
              <th className="px-5 py-2.5 font-medium">Status</th>
              <th className="px-5 py-2.5 font-medium text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-gray-400">
                  Belum ada data pimpinan.
                </td>
              </tr>
            )}
            {rows.map((l) => (
              <tr
                key={l.id}
                className="border-b border-gray-50 last:border-0 hover:bg-surface-muted/50 transition-colors"
              >
                <td className="px-5 py-3 font-medium text-gray-800">{l.nama}</td>
                <td className="px-5 py-3 text-gray-600">{l.jabatan}</td>
                <td className="px-5 py-3">
                  {l.tipe === "pjs" ? (
                    <Badge variant="warning">PJS</Badge>
                  ) : (
                    <Badge variant="neutral">Tetap</Badge>
                  )}
                </td>
                <td className="px-5 py-3 text-gray-600">
                  {l.tipe === "pjs" ? l.namaPjs : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-5 py-3">
                  <button
                    onClick={() => onToggle(l)}
                    className="focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full"
                    aria-label={l.isAktif ? "Nonaktifkan" : "Aktifkan"}
                  >
                    <Badge variant={l.isAktif ? "success" : "neutral"}>
                      {l.isAktif ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </button>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onEdit(l)}
                      className="p-1.5 rounded-md text-gray-500 hover:text-primary hover:bg-primary-50 transition-colors"
                      aria-label="Ubah pimpinan"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDelete(l.id)}
                      className="p-1.5 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                      aria-label="Hapus pimpinan"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
