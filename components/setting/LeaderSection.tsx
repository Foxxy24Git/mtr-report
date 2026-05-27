"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Building2 } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";

export interface LeaderRow {
  id: string;
  nama: string;
  jabatan: "infrastruktur" | "divisi";
  isPjs: boolean;
  aktif: boolean;
}

const JABATAN_LABEL: Record<LeaderRow["jabatan"], string> = {
  infrastruktur: "Bag. Infrastruktur TI",
  divisi: "Pemimpin Divisi",
};

type FormState = {
  nama: string;
  jabatan: LeaderRow["jabatan"];
  isPjs: boolean;
  aktif: boolean;
};

const EMPTY: FormState = {
  nama: "",
  jabatan: "infrastruktur",
  isPjs: false,
  aktif: true,
};

export function LeaderSection({ initialLeaders }: { initialLeaders: LeaderRow[] }) {
  const [leaders, setLeaders] = useState(initialLeaders);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Konfirmasi hapus
  const [delId, setDelId] = useState<string | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState("");

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY);
    setError("");
    setOpen(true);
  }
  function openEdit(l: LeaderRow) {
    setEditingId(l.id);
    setForm({ nama: l.nama, jabatan: l.jabatan, isPjs: l.isPjs, aktif: l.aktif });
    setError("");
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.nama.trim()) return setError("Nama wajib diisi.");
    setBusy(true);
    try {
      const res = await fetch(
        editingId ? `/api/leaders/${editingId}` : "/api/leaders",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
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
      body: JSON.stringify({ aktif: !l.aktif }),
    });
    if (res.ok) {
      const data = await res.json();
      setLeaders((prev) => prev.map((x) => (x.id === l.id ? data.leader : x)));
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
    <Card padding="none">
      <div className="flex items-center justify-between p-5 border-b border-gray-100">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" /> Pimpinan Infrastruktur
            &amp; Divisi
          </CardTitle>
          <p className="text-xs text-gray-500 mt-0.5">
            Daftar penanda tangan laporan. Tandai PJS untuk pejabat pengganti.
          </p>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="w-4 h-4" /> Tambah Pimpinan
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
              <th className="px-5 py-2.5 font-medium">Nama</th>
              <th className="px-5 py-2.5 font-medium">Jabatan</th>
              <th className="px-5 py-2.5 font-medium">PJS</th>
              <th className="px-5 py-2.5 font-medium">Status</th>
              <th className="px-5 py-2.5 font-medium text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {leaders.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-gray-400">
                  Belum ada data pimpinan.
                </td>
              </tr>
            )}
            {leaders.map((l) => (
              <tr
                key={l.id}
                className="border-b border-gray-50 last:border-0 hover:bg-surface-muted/50 transition-colors"
              >
                <td className="px-5 py-3 font-medium text-gray-800">{l.nama}</td>
                <td className="px-5 py-3 text-gray-600">
                  {JABATAN_LABEL[l.jabatan]}
                </td>
                <td className="px-5 py-3">
                  {l.isPjs ? (
                    <Badge variant="warning">PJS</Badge>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-5 py-3">
                  <button
                    onClick={() => toggleAktif(l)}
                    className="focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full"
                    aria-label={l.aktif ? "Nonaktifkan" : "Aktifkan"}
                  >
                    <Badge variant={l.aktif ? "success" : "neutral"}>
                      {l.aktif ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </button>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => openEdit(l)}
                      className="p-1.5 rounded-md text-gray-500 hover:text-primary hover:bg-primary-50 transition-colors"
                      aria-label="Ubah pimpinan"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setDelErr("");
                        setDelId(l.id);
                      }}
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

      {/* Add / Edit modal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editingId ? "Ubah Pimpinan" : "Tambah Pimpinan"}
      >
        <form onSubmit={submit} className="space-y-4">
          <Input
            label="Nama Pimpinan"
            required
            value={form.nama}
            onChange={(e) => setForm({ ...form, nama: e.target.value })}
          />
          <Select
            label="Jabatan"
            required
            value={form.jabatan}
            onChange={(e) =>
              setForm({
                ...form,
                jabatan: e.target.value as LeaderRow["jabatan"],
              })
            }
          >
            <option value="infrastruktur">Bag. Infrastruktur TI</option>
            <option value="divisi">Pemimpin Divisi</option>
          </Select>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isPjs}
              onChange={(e) => setForm({ ...form, isPjs: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            Pejabat Pengganti Sementara (PJS)
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.aktif}
              onChange={(e) => setForm({ ...form, aktif: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            Aktif (muncul di pilihan tiket)
          </label>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
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
          Pimpinan akan dihapus permanen. Jika masih dipakai di tiket, gunakan
          tombol status untuk menonaktifkan saja.
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
    </Card>
  );
}
