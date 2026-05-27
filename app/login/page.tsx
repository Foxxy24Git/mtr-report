"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Image from "next/image";
import { Lock, User2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const today = useMemo(() => new Date(), []);
  const hariIni = useMemo(
    () =>
      new Intl.DateTimeFormat("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(today),
    [today]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal masuk.");
        return;
      }
      const params = new URLSearchParams(window.location.search);
      const next = params.get("next");
      router.replace(next && next.startsWith("/") ? next : "/dashboard");
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-900 via-primary to-primary-dark p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md"
      >
        <div className="bg-white rounded-2xl shadow-card-lg overflow-hidden">
          {/* Header */}
          <div className="bg-primary px-8 pt-8 pb-6 text-center">
            <div className="relative w-40 h-12 mx-auto mb-3">
              <Image
                src="/logo-bank-nagari.svg"
                alt="Logo Bank Nagari"
                fill
                className="object-contain"
                priority
              />
            </div>
            <h1 className="text-white text-lg font-display font-bold">
              mtr-Report
            </h1>
            <p className="text-primary-200 text-xs mt-0.5">
              Monitoring &amp; Tiket Gangguan ATM &amp; Jaringan
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-8 py-7 space-y-4">
            <p className="text-xs text-gray-400 text-center capitalize">
              {hariIni}
            </p>

            <div className="relative">
              <User2 className="absolute left-3 top-[34px] w-4 h-4 text-gray-400 pointer-events-none" />
              <Input
                label="Username"
                placeholder="mis. mtr3"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-[34px] w-4 h-4 text-gray-400 pointer-events-none" />
              <Input
                label="Password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9"
              />
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </motion.div>
            )}

            <Button
              type="submit"
              size="lg"
              loading={loading}
              className="w-full"
            >
              Masuk
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-primary-200/70 mt-5">
          Bank Nagari · Divisi TI · {new Date().getFullYear()}
        </p>
      </motion.div>
    </div>
  );
}
