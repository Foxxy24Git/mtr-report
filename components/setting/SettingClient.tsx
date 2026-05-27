"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { UserCircle, KeyRound, Users, Building2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Role } from "@/lib/roles";
import { ProfilSection } from "@/components/setting/ProfilSection";
import { PasswordSection } from "@/components/setting/PasswordSection";
import { UserSection, type UserRow } from "@/components/setting/UserSection";
import { LeaderSection, type LeaderRow } from "@/components/setting/LeaderSection";

interface Props {
  me: {
    username: string;
    nama: string;
    role: Role;
    fotoProfilUrl: string | null;
    ttdUrl: string | null;
    createdAt: string;
  };
  users: UserRow[] | null;
  leaders: LeaderRow[] | null;
}

export function SettingClient({ me, users, leaders }: Props) {
  const isAdmin = me.role === "superadmin";

  const tabs = [
    { key: "profil", label: "Profil", icon: UserCircle },
    { key: "password", label: "Keamanan", icon: KeyRound },
    ...(isAdmin
      ? [
          { key: "users", label: "Pengguna", icon: Users },
          { key: "leaders", label: "Pimpinan", icon: Building2 },
        ]
      : []),
  ] as const;

  const [active, setActive] = useState<(typeof tabs)[number]["key"]>("profil");

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">Setting</h1>
        <p className="page-subtitle">
          Kelola profil, keamanan akun
          {isAdmin && ", pengguna, dan daftar pimpinan"}.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={cn(
                "relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
                isActive ? "text-primary" : "text-gray-500 hover:text-gray-800"
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
              {isActive && (
                <motion.span
                  layoutId="setting-tab-underline"
                  className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary rounded-full"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
            </button>
          );
        })}
      </div>

      <motion.div
        key={active}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {active === "profil" && (
          <ProfilSection
            me={{
              username: me.username,
              nama: me.nama,
              role: me.role,
              fotoProfilUrl: me.fotoProfilUrl,
              ttdUrl: me.ttdUrl,
              createdAt: me.createdAt,
            }}
          />
        )}
        {active === "password" && <PasswordSection />}
        {active === "users" && users && <UserSection initialUsers={users} />}
        {active === "leaders" && leaders && (
          <LeaderSection initialLeaders={leaders} />
        )}
      </motion.div>
    </div>
  );
}
