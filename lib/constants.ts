import {
  LayoutDashboard,
  Activity,
  TicketPlus,
  FileBarChart2,
  Server,
  Thermometer,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/roles";

export type { Role };

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
  /** Role yang boleh mengakses menu ini. Kosong = semua role login. */
  roles?: Role[];
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    description: "Ringkasan & status open tiket",
  },
  {
    label: "Daily Monitoring",
    href: "/daily-monitoring",
    icon: Activity,
    description: "Semua tiket ATM & jaringan aktif",
  },
  {
    label: "Supervisi",
    href: "/supervisi",
    icon: ShieldCheck,
    description: "Tinjau & setujui tiket gangguan",
    roles: ["superadmin", "supervisi"],
  },
  {
    label: "Open Tiket",
    href: "/open-tiket",
    icon: TicketPlus,
    description: "Buat tiket gangguan baru",
    roles: ["superadmin", "user"],
  },
  {
    label: "Rekap Laporan",
    href: "/rekap-laporan",
    icon: FileBarChart2,
    description: "Download laporan Excel harian",
  },
  {
    label: "Data ATM",
    href: "/data-atm",
    icon: Server,
    description: "Master data ATM & jaringan",
    roles: ["superadmin", "user"],
  },
  {
    label: "Suhu / Server",
    href: "/suhu-server",
    icon: Thermometer,
    description: "Log suhu AC & pemantauan server",
    roles: ["superadmin", "user"],
  },
  {
    label: "Setting",
    href: "/setting",
    icon: Settings,
    description: "Profil, password, & kelola user",
  },
];

export const SHIFT_LABELS: Record<string, string> = {
  A: "Shift A (07:00–15:00)",
  B: "Shift B (15:00–23:00)",
  C: "Shift C (23:00–07:00)",
  D: "Shift D (07:00–19:00)",
  E: "Shift E (19:00–07:00)",
};

export const APP_NAME = "mtr-Report";
export const APP_SUBTITLE = "Monitoring & Tiket Gangguan ATM";
export const BANK_NAME = "Bank Nagari";
