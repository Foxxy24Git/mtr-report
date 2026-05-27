"use client";

import { useState } from "react";
import { KeyRound, CheckCircle2 } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function PasswordSection() {
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirm: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setDone(false);
    if (form.newPassword.length < 4) {
      return setError("Password baru minimal 4 karakter.");
    }
    if (form.newPassword !== form.confirm) {
      return setError("Konfirmasi password tidak cocok.");
    }
    setBusy(true);
    try {
      const res = await fetch("/api/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Gagal mengubah password.");
        return;
      }
      setForm({ currentPassword: "", newPassword: "", confirm: "" });
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardTitle className="mb-1 flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-primary" /> Ganti Password
      </CardTitle>
      <p className="text-xs text-gray-500 mb-4">
        Gunakan password yang kuat. Berlaku untuk semua peran.
      </p>

      <form onSubmit={submit} className="space-y-4 max-w-sm">
        <Input
          label="Password Lama"
          type="password"
          autoComplete="current-password"
          required
          value={form.currentPassword}
          onChange={(e) =>
            setForm({ ...form, currentPassword: e.target.value })
          }
        />
        <Input
          label="Password Baru"
          type="password"
          autoComplete="new-password"
          required
          value={form.newPassword}
          onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
          hint="Minimal 4 karakter."
        />
        <Input
          label="Konfirmasi Password Baru"
          type="password"
          autoComplete="new-password"
          required
          value={form.confirm}
          onChange={(e) => setForm({ ...form, confirm: e.target.value })}
        />

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </p>
        )}
        {done && (
          <p className="flex items-center gap-1.5 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
            <CheckCircle2 className="w-4 h-4" /> Password berhasil diubah.
          </p>
        )}

        <Button type="submit" loading={busy}>
          Simpan Password Baru
        </Button>
      </form>
    </Card>
  );
}
