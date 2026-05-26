# Fase 0: Setup Proyek mtr-Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inisialisasi full-stack Next.js + TypeScript + Tailwind + Prisma + Framer Motion dengan design system korporat Bank Nagari dan shell UI (sidebar + topbar) yang siap dikembangkan.

**Architecture:** Monorepo Next.js 15 App Router — semua kode dalam satu repo. Route group `(app)` membungkus semua halaman autentikasi-wajib dengan shell layout (Sidebar + Topbar). Komponen UI dibangun dari scratch (bukan library seperti shadcn) agar kontrol penuh atas warna korporat.

**Tech Stack:** Next.js 15 (App Router), TypeScript 5, Tailwind CSS 3, Prisma 5, Framer Motion 11, lucide-react (icons), clsx + tailwind-merge

---

## File Structure

```
mtr-Report/
├── .env                            # DATABASE_URL, NEXTAUTH_SECRET
├── .env.example                    # Template env untuk tim
├── .gitignore
├── docker-compose.yml              # Services: db (PostgreSQL) + app
├── Dockerfile                      # Build image Next.js
├── next.config.ts
├── tailwind.config.ts              # Tema korporat Bank Nagari
├── tsconfig.json
├── package.json
├── prisma/
│   └── schema.prisma               # Skema minimal (datasource + generator saja)
├── public/
│   └── logo-bank-nagari.svg        # Logo placeholder Bank Nagari
├── app/
│   ├── globals.css                 # CSS vars + Tailwind directives
│   ├── layout.tsx                  # Root layout (font, metadata)
│   ├── page.tsx                    # Redirect → /dashboard
│   └── (app)/
│       ├── layout.tsx              # Shell layout: Sidebar + Topbar wrapper
│       ├── dashboard/page.tsx      # Placeholder halaman Dashboard
│       ├── daily-monitoring/page.tsx
│       ├── open-tiket/page.tsx
│       ├── rekap-laporan/page.tsx
│       ├── data-atm/page.tsx
│       ├── suhu-server/page.tsx
│       └── setting/page.tsx
├── components/
│   ├── ui/
│   │   ├── Button.tsx              # Variant: primary, secondary, ghost, danger
│   │   ├── Card.tsx                # Surface card dengan shadow halus
│   │   ├── Badge.tsx               # Variant: success, warning, danger, info, neutral
│   │   ├── Input.tsx               # Text input + label + error message
│   │   ├── Modal.tsx               # Dialog animasi Framer Motion
│   │   └── Table.tsx               # Tabel dengan header sticky + zebra stripe
│   └── layout/
│       ├── Sidebar.tsx             # Nav links + Bank Nagari branding
│       └── Topbar.tsx              # Profil user + indikator shift aktif
└── lib/
    ├── cn.ts                       # clsx + tailwind-merge helper
    └── constants.ts                # NAV_ITEMS, warna, shift labels
```

---

## Task 1: Inisialisasi Proyek Next.js

**Files:**
- Create: `package.json` (via `npx create-next-app`)
- Create: `next.config.ts`
- Create: `tsconfig.json`

- [ ] **Step 1: Buat proyek Next.js baru**

```bash
cd /Users/user/mtr-Report
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --no-src-dir \
  --import-alias "@/*" \
  --no-turbopack
```

Jawab setiap prompt dengan nilai default (tekan Enter). Bila ada konflik file (README.md / .gitignore), pilih **keep existing** atau overwrite sesuai preferensi.

- [ ] **Step 2: Install dependensi tambahan**

```bash
npm install framer-motion lucide-react clsx tailwind-merge
npm install prisma @prisma/client
npm install -D @types/node
```

- [ ] **Step 3: Verifikasi `npm run dev` berjalan**

```bash
npm run dev
```

Expected: Server starts on `http://localhost:3000` tanpa error. Stop dengan Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git init
git add package.json package-lock.json next.config.ts tsconfig.json .gitignore .eslintrc.json
git commit -m "chore: initialize Next.js 15 App Router project"
```

---

## Task 2: Konfigurasi Tailwind — Tema Korporat Bank Nagari

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `app/globals.css`

- [ ] **Step 1: Tulis `tailwind.config.ts` dengan palet Bank Nagari**

Ganti seluruh isi `tailwind.config.ts`:

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Palet korporat Bank Nagari
        primary: {
          50:  "#e6edf7",
          100: "#c0d0eb",
          200: "#96b0dd",
          300: "#6b90cf",
          400: "#4d78c5",
          500: "#2e60bb",
          600: "#2958af",
          700: "#224da0",
          800: "#1b4291",
          900: "#0f3070",
          DEFAULT: "#003580",   // Biru korporat Bank Nagari
          dark:    "#002560",
          light:   "#0052CC",
        },
        accent: {
          DEFAULT: "#C8A84B",   // Emas/gold aksen
          light:   "#DFC06E",
          dark:    "#A88930",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          muted:   "#F4F6FA",
          subtle:  "#EEF1F8",
        },
        nagari: {
          blue:  "#003580",
          gold:  "#C8A84B",
          navy:  "#001E4E",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Plus Jakarta Sans", "Inter", "sans-serif"],
      },
      boxShadow: {
        card:   "0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.06)",
        "card-md": "0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.05)",
        "card-lg": "0 10px 15px -3px rgb(0 0 0 / 0.07), 0 4px 6px -4px rgb(0 0 0 / 0.05)",
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        sm: "0.375rem",
        md: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-out",
        "slide-in-left": "slideInLeft 0.25s ease-out",
        "slide-up": "slideUp 0.25s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideInLeft: {
          "0%": { transform: "translateX(-16px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 2: Tulis `app/globals.css`**

Ganti isi `app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap");

@layer base {
  :root {
    --sidebar-width: 256px;
    --topbar-height: 64px;
  }

  * {
    @apply border-gray-200;
  }

  body {
    @apply bg-surface-muted text-gray-900 font-sans antialiased;
  }

  h1, h2, h3, h4, h5, h6 {
    @apply font-display font-semibold;
  }
}

@layer components {
  .page-title {
    @apply text-xl font-display font-bold text-gray-900;
  }

  .page-subtitle {
    @apply text-sm text-gray-500 mt-0.5;
  }

  .section-label {
    @apply text-xs font-semibold text-gray-400 uppercase tracking-wider;
  }
}

/* Scrollbar tipis untuk sidebar */
.scrollbar-thin::-webkit-scrollbar {
  width: 4px;
}
.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}
.scrollbar-thin::-webkit-scrollbar-thumb {
  @apply bg-gray-300 rounded-full;
}
```

- [ ] **Step 3: Verifikasi Tailwind build tanpa error**

```bash
npm run build 2>&1 | head -30
```

Expected: Build sukses atau hanya warnings, bukan error.

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.ts app/globals.css
git commit -m "feat: add Bank Nagari corporate color palette to Tailwind config"
```

---

## Task 3: Setup Prisma (minimal — schema saja)

**Files:**
- Create: `prisma/schema.prisma`
- Create: `.env`
- Create: `.env.example`

- [ ] **Step 1: Inisialisasi Prisma**

```bash
npx prisma init --datasource-provider postgresql
```

Expected: Buat folder `prisma/` dengan `schema.prisma` dan file `.env`.

- [ ] **Step 2: Tulis schema Prisma minimal (placeholder)**

Ganti isi `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Schema lengkap diimplementasikan di Fase 1.
// Fase 0 hanya konfigurasi datasource.
```

- [ ] **Step 3: Tulis `.env`**

```
# Database (PostgreSQL via Docker)
DATABASE_URL="postgresql://mtr_user:mtr_pass@localhost:5432/mtr_report_db?schema=public"

# Next.js
NEXTAUTH_SECRET="dev-secret-change-in-production"
NEXTAUTH_URL="http://localhost:3000"
```

- [ ] **Step 4: Tulis `.env.example`**

```
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public"
NEXTAUTH_SECRET="your-secret-here"
NEXTAUTH_URL="http://localhost:3000"
```

- [ ] **Step 5: Tambah `.env` ke .gitignore**

Pastikan `.env` sudah ada di `.gitignore` (create-next-app biasanya sudah menambahkan). Verifikasi:

```bash
grep -n "\.env" .gitignore
```

Expected: ada baris `.env` atau `.env*.local`.

Jika belum ada, tambahkan:
```
.env
.env.local
```

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma .env.example .gitignore
git commit -m "chore: add Prisma config and .env template"
```

---

## Task 4: Utilitas `lib/`

**Files:**
- Create: `lib/cn.ts`
- Create: `lib/constants.ts`

- [ ] **Step 1: Tulis `lib/cn.ts`**

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 2: Tulis `lib/constants.ts`**

```typescript
import {
  LayoutDashboard,
  Activity,
  TicketPlus,
  FileBarChart2,
  Server,
  Thermometer,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
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
    label: "Open Tiket",
    href: "/open-tiket",
    icon: TicketPlus,
    description: "Buat tiket gangguan baru",
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
  },
  {
    label: "Suhu / Server",
    href: "/suhu-server",
    icon: Thermometer,
    description: "Log suhu AC & pemantauan server",
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
```

- [ ] **Step 3: Commit**

```bash
git add lib/cn.ts lib/constants.ts
git commit -m "feat: add cn utility and app constants (nav items, shifts)"
```

---

## Task 5: Logo Placeholder Bank Nagari

**Files:**
- Create: `public/logo-bank-nagari.svg`

- [ ] **Step 1: Buat logo SVG placeholder**

Buat file `public/logo-bank-nagari.svg` dengan logo teks placeholder:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="160" height="48" viewBox="0 0 160 48">
  <rect width="160" height="48" rx="6" fill="#003580"/>
  <text x="12" y="20" font-family="Arial, sans-serif" font-size="10" font-weight="700" fill="#C8A84B" letter-spacing="1">BANK</text>
  <text x="12" y="36" font-family="Arial, sans-serif" font-size="14" font-weight="800" fill="#FFFFFF" letter-spacing="0.5">NAGARI</text>
  <rect x="100" y="8" width="48" height="32" rx="4" fill="#C8A84B" opacity="0.2"/>
  <text x="124" y="29" font-family="Arial, sans-serif" font-size="22" font-weight="900" fill="#C8A84B" text-anchor="middle">N</text>
</svg>
```

> **Note:** Ganti file ini dengan logo Bank Nagari asli (format PNG/SVG) sebelum produksi. Letakkan di `/public/logo-bank-nagari.png` dan update import di `Sidebar.tsx`.

- [ ] **Step 2: Commit**

```bash
git add public/logo-bank-nagari.svg
git commit -m "chore: add Bank Nagari logo placeholder"
```

---

## Task 6: Komponen UI — Button, Badge, Card

**Files:**
- Create: `components/ui/Button.tsx`
- Create: `components/ui/Badge.tsx`
- Create: `components/ui/Card.tsx`

- [ ] **Step 1: Tulis `components/ui/Button.tsx`**

```typescript
"use client";

import { cn } from "@/lib/cn";
import { Loader2 } from "lucide-react";
import { type ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-primary text-white hover:bg-primary-dark active:bg-primary-900 shadow-sm",
  secondary:
    "bg-surface-subtle text-gray-700 hover:bg-gray-200 active:bg-gray-300",
  ghost:
    "text-gray-600 hover:bg-surface-subtle hover:text-gray-900",
  danger:
    "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm",
  outline:
    "border border-primary text-primary hover:bg-primary hover:text-white",
};

const sizeClasses: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "px-3 py-1.5 text-xs font-medium rounded",
  md: "px-4 py-2 text-sm font-medium rounded-md",
  lg: "px-6 py-2.5 text-base font-semibold rounded-lg",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center gap-2 transition-all duration-150",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
```

- [ ] **Step 2: Tulis `components/ui/Badge.tsx`**

```typescript
import { cn } from "@/lib/cn";
import { type HTMLAttributes } from "react";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "success" | "warning" | "danger" | "info" | "neutral" | "primary";
}

const variantClasses: Record<NonNullable<BadgeProps["variant"]>, string> = {
  success: "bg-green-100 text-green-800 border border-green-200",
  warning: "bg-amber-100 text-amber-800 border border-amber-200",
  danger:  "bg-red-100  text-red-800  border border-red-200",
  info:    "bg-blue-100 text-blue-800 border border-blue-200",
  neutral: "bg-gray-100 text-gray-700 border border-gray-200",
  primary: "bg-primary-50 text-primary-800 border border-primary-100",
};

export function Badge({ variant = "neutral", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 3: Tulis `components/ui/Card.tsx`**

```typescript
import { cn } from "@/lib/cn";
import { type HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingClasses = {
  none: "",
  sm:   "p-4",
  md:   "p-5",
  lg:   "p-6",
};

export function Card({ padding = "md", className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "bg-white rounded-xl shadow-card border border-gray-100",
        paddingClasses[padding],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center justify-between mb-4", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("text-base font-semibold text-gray-900", className)} {...props}>
      {children}
    </h3>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add components/ui/Button.tsx components/ui/Badge.tsx components/ui/Card.tsx
git commit -m "feat: add Button, Badge, Card UI components with Bank Nagari theme"
```

---

## Task 7: Komponen UI — Input, Table, Modal

**Files:**
- Create: `components/ui/Input.tsx`
- Create: `components/ui/Table.tsx`
- Create: `components/ui/Modal.tsx`

- [ ] **Step 1: Tulis `components/ui/Input.tsx`**

```typescript
import { cn } from "@/lib/cn";
import { type InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-gray-700"
          >
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "w-full px-3 py-2 text-sm rounded-md border bg-white",
            "placeholder:text-gray-400",
            "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
            "transition-colors duration-150",
            error
              ? "border-red-400 focus:ring-red-200 focus:border-red-500"
              : "border-gray-300 hover:border-gray-400",
            "disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed",
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
```

- [ ] **Step 2: Tulis `components/ui/Table.tsx`**

```typescript
import { cn } from "@/lib/cn";
import { type HTMLAttributes, type TdHTMLAttributes, type ThHTMLAttributes } from "react";

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-card">
      <table
        className={cn("w-full text-sm text-left border-collapse", className)}
        {...props}
      />
    </div>
  );
}

export function TableHead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn("bg-surface-subtle border-b border-gray-200", className)}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      className={cn(
        "[&>tr:nth-child(even)]:bg-gray-50/50 [&>tr]:border-b [&>tr]:border-gray-100 [&>tr:last-child]:border-0",
        className
      )}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("hover:bg-primary-50/40 transition-colors duration-100", className)}
      {...props}
    />
  );
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap",
        className
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn("px-4 py-3 text-gray-700 align-top", className)}
      {...props}
    />
  );
}
```

- [ ] **Step 3: Tulis `components/ui/Modal.tsx`**

```typescript
"use client";

import { cn } from "@/lib/cn";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { type ReactNode, useEffect } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
};

export function Modal({ open, onClose, title, description, size = "md", children }: ModalProps) {
  // Tutup modal saat tekan Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Cegah scroll body saat modal terbuka
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              key="panel"
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                "relative w-full bg-white rounded-2xl shadow-card-lg",
                "border border-gray-100 overflow-hidden",
                sizeClasses[size]
              )}
            >
              {/* Header */}
              {(title || description) && (
                <div className="flex items-start justify-between p-5 border-b border-gray-100">
                  <div>
                    {title && (
                      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
                    )}
                    {description && (
                      <p className="mt-0.5 text-sm text-gray-500">{description}</p>
                    )}
                  </div>
                  <button
                    onClick={onClose}
                    className="ml-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Body */}
              <div className="p-5">{children}</div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add components/ui/Input.tsx components/ui/Table.tsx components/ui/Modal.tsx
git commit -m "feat: add Input, Table, Modal UI components"
```

---

## Task 8: Layout — Sidebar

**Files:**
- Create: `components/layout/Sidebar.tsx`

- [ ] **Step 1: Tulis `components/layout/Sidebar.tsx`**

```typescript
"use client";

import { NAV_ITEMS, APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/cn";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="fixed left-0 top-0 h-screen w-64 bg-primary flex flex-col z-30 shadow-xl"
      style={{ width: "var(--sidebar-width)" }}
    >
      {/* Logo + App Name */}
      <div className="flex flex-col items-center px-5 py-5 border-b border-primary-700/50">
        <div className="relative w-36 h-11 mb-2">
          <Image
            src="/logo-bank-nagari.svg"
            alt="Logo Bank Nagari"
            fill
            className="object-contain"
            priority
          />
        </div>
        <p className="text-xs text-primary-200 font-medium tracking-wide mt-1">
          {APP_NAME}
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin py-3 px-3">
        <p className="section-label text-primary-300 px-3 mb-2">MENU UTAMA</p>

        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium",
                    "transition-all duration-150",
                    isActive
                      ? "bg-white/15 text-white"
                      : "text-primary-100 hover:bg-white/10 hover:text-white"
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="sidebar-active-pill"
                      className="absolute inset-0 rounded-lg bg-white/15"
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    />
                  )}
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-accent rounded-r-full" />
                  )}
                  <Icon
                    className={cn(
                      "w-4 h-4 shrink-0 relative z-10",
                      isActive ? "text-accent" : "text-primary-300"
                    )}
                  />
                  <span className="relative z-10">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer: versi */}
      <div className="px-5 py-3 border-t border-primary-700/50">
        <p className="text-xs text-primary-400 text-center">mtr-Report v1.0</p>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/layout/Sidebar.tsx
git commit -m "feat: add Sidebar component with Bank Nagari branding and animated active state"
```

---

## Task 9: Layout — Topbar

**Files:**
- Create: `components/layout/Topbar.tsx`

- [ ] **Step 1: Tulis `components/layout/Topbar.tsx`**

```typescript
"use client";

import { cn } from "@/lib/cn";
import { SHIFT_LABELS } from "@/lib/constants";
import { Badge } from "@/components/ui/Badge";
import { Bell, ChevronDown, User2 } from "lucide-react";
import { useState } from "react";

// Fase 0: data statis — akan diganti dengan data sesi auth di Fase 1
const MOCK_USER = {
  nama: "Kurnia Fajri",
  username: "mtr3",
  shift: "A" as keyof typeof SHIFT_LABELS,
};

export function Topbar() {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <header
      className={cn(
        "fixed top-0 right-0 z-20 flex items-center justify-between",
        "px-6 bg-white border-b border-gray-200 shadow-sm"
      )}
      style={{
        left: "var(--sidebar-width)",
        height: "var(--topbar-height)",
      }}
    >
      {/* Kiri: judul halaman (slot — akan diisi tiap halaman) */}
      <div className="flex items-center gap-3">
        <div>
          <p className="text-xs text-gray-400 font-medium">Sistem Monitoring</p>
          <p className="text-sm font-semibold text-gray-900">ATM & Jaringan Bank Nagari</p>
        </div>
      </div>

      {/* Kanan: notif + profil + shift */}
      <div className="flex items-center gap-3">
        {/* Shift badge */}
        <Badge variant="primary" className="text-xs font-semibold">
          {SHIFT_LABELS[MOCK_USER.shift]}
        </Badge>

        {/* Notifikasi */}
        <button className="relative p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors">
          <Bell className="w-5 h-5" />
          {/* Dot notifikasi */}
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
        </button>

        {/* Profil dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            {/* Avatar placeholder */}
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
              <User2 className="w-4 h-4 text-white" />
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-sm font-medium text-gray-800 leading-tight">
                {MOCK_USER.nama}
              </p>
              <p className="text-xs text-gray-400 leading-tight">
                @{MOCK_USER.username}
              </p>
            </div>
            <ChevronDown
              className={cn(
                "w-4 h-4 text-gray-400 transition-transform duration-200",
                dropdownOpen && "rotate-180"
              )}
            />
          </button>

          {/* Dropdown menu */}
          {dropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setDropdownOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1.5 w-44 bg-white rounded-xl shadow-card-lg border border-gray-100 z-20 overflow-hidden animate-slide-up">
                <div className="px-3 py-2.5 border-b border-gray-100">
                  <p className="text-xs text-gray-400">Masuk sebagai</p>
                  <p className="text-sm font-semibold text-gray-800">{MOCK_USER.nama}</p>
                </div>
                <ul className="py-1">
                  <li>
                    <a
                      href="/setting"
                      className="flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Profil & Setting
                    </a>
                  </li>
                  <li>
                    <button
                      className="w-full flex items-center px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                      onClick={() => alert("Logout — akan diimplementasikan Fase 1")}
                    >
                      Keluar
                    </button>
                  </li>
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/layout/Topbar.tsx
git commit -m "feat: add Topbar with shift badge, notification bell, and profile dropdown"
```

---

## Task 10: Shell Layout dan Halaman Placeholder

**Files:**
- Modify: `app/layout.tsx`
- Create: `app/(app)/layout.tsx`
- Modify: `app/page.tsx`
- Create: `app/(app)/dashboard/page.tsx`
- Create: `app/(app)/daily-monitoring/page.tsx`
- Create: `app/(app)/open-tiket/page.tsx`
- Create: `app/(app)/rekap-laporan/page.tsx`
- Create: `app/(app)/data-atm/page.tsx`
- Create: `app/(app)/suhu-server/page.tsx`
- Create: `app/(app)/setting/page.tsx`

- [ ] **Step 1: Tulis `app/layout.tsx` (root layout)**

```typescript
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "mtr-Report — Bank Nagari",
  description: "Sistem Monitoring & Tiket Gangguan ATM Bank Nagari",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Tulis `app/page.tsx` (redirect ke dashboard)**

```typescript
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/dashboard");
}
```

- [ ] **Step 3: Tulis `app/(app)/layout.tsx` (shell layout)**

```typescript
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import type { ReactNode } from "react";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-muted">
      <Sidebar />
      <Topbar />
      <main
        className="min-h-screen"
        style={{
          paddingLeft: "var(--sidebar-width)",
          paddingTop: "var(--topbar-height)",
        }}
      >
        <div className="p-6 max-w-screen-2xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Buat komponen PlaceholderPage (DRY — dipakai semua halaman placeholder)**

Buat file `components/ui/PlaceholderPage.tsx`:

```typescript
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { type LucideIcon } from "lucide-react";

interface PlaceholderPageProps {
  title: string;
  description: string;
  icon: LucideIcon;
  fase: string;
}

export function PlaceholderPage({ title, description, icon: Icon, fase }: PlaceholderPageProps) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle">{description}</p>
      </div>

      <Card className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center mb-4">
          <Icon className="w-8 h-8 text-primary-600" />
        </div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">{title}</h2>
        <p className="text-sm text-gray-500 mb-4 max-w-xs">{description}</p>
        <Badge variant="info">{fase}</Badge>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Tulis `app/(app)/dashboard/page.tsx`**

```typescript
import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { LayoutDashboard } from "lucide-react";

export default function DashboardPage() {
  return (
    <PlaceholderPage
      title="Dashboard"
      description="Ringkasan open tiket ATM & jaringan, kalender, dan alert realtime."
      icon={LayoutDashboard}
      fase="Diimplementasikan di Fase 4"
    />
  );
}
```

- [ ] **Step 6: Tulis halaman placeholder lainnya**

`app/(app)/daily-monitoring/page.tsx`:
```typescript
import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { Activity } from "lucide-react";
export default function DailyMonitoringPage() {
  return (
    <PlaceholderPage
      title="Daily Monitoring"
      description="Tracking semua open tiket ATM & jaringan dengan log kegiatan realtime."
      icon={Activity}
      fase="Diimplementasikan di Fase 3"
    />
  );
}
```

`app/(app)/open-tiket/page.tsx`:
```typescript
import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { TicketPlus } from "lucide-react";
export default function OpenTiketPage() {
  return (
    <PlaceholderPage
      title="Open Tiket"
      description="Form pembukaan tiket gangguan ATM & jaringan dengan nomor BN- otomatis."
      icon={TicketPlus}
      fase="Diimplementasikan di Fase 2"
    />
  );
}
```

`app/(app)/rekap-laporan/page.tsx`:
```typescript
import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { FileBarChart2 } from "lucide-react";
export default function RekapLaporanPage() {
  return (
    <PlaceholderPage
      title="Rekap Laporan"
      description="Download laporan harian & per-user dalam format Excel identik Form OPS-001."
      icon={FileBarChart2}
      fase="Diimplementasikan di Fase 6"
    />
  );
}
```

`app/(app)/data-atm/page.tsx`:
```typescript
import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { Server } from "lucide-react";
export default function DataAtmPage() {
  return (
    <PlaceholderPage
      title="Data ATM & Jaringan"
      description="Master data 558 ATM Bank Nagari beserta vendor ATM dan jaringan."
      icon={Server}
      fase="Diimplementasikan di Fase 2"
    />
  );
}
```

`app/(app)/suhu-server/page.tsx`:
```typescript
import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { Thermometer } from "lucide-react";
export default function SuhuServerPage() {
  return (
    <PlaceholderPage
      title="Suhu AC & Log Server"
      description="Pemantauan suhu ruang server 3x/shift dan log kondisi server NPAY, BI-FAST, dll."
      icon={Thermometer}
      fase="Diimplementasikan di Fase 5"
    />
  );
}
```

`app/(app)/setting/page.tsx`:
```typescript
import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { Settings } from "lucide-react";
export default function SettingPage() {
  return (
    <PlaceholderPage
      title="Setting"
      description="Kelola profil, password, foto, tanda tangan digital, dan manajemen user."
      icon={Settings}
      fase="Diimplementasikan di Fase 7"
    />
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add app/layout.tsx app/page.tsx "app/(app)/" components/ui/PlaceholderPage.tsx
git commit -m "feat: add shell layout with sidebar/topbar and placeholder pages for all routes"
```

---

## Task 11: Docker Compose (PostgreSQL + App)

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`

- [ ] **Step 1: Tulis `Dockerfile`**

```dockerfile
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Production
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
```

- [ ] **Step 2: Aktifkan `output: standalone` di next.config.ts**

Ganti isi `next.config.ts`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

- [ ] **Step 3: Tulis `docker-compose.yml`**

```yaml
version: "3.9"

services:
  db:
    image: postgres:16-alpine
    container_name: mtr_db
    restart: unless-stopped
    environment:
      POSTGRES_USER: mtr_user
      POSTGRES_PASSWORD: mtr_pass
      POSTGRES_DB: mtr_report_db
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mtr_user -d mtr_report_db"]
      interval: 10s
      timeout: 5s
      retries: 5

  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: mtr_app
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: "postgresql://mtr_user:mtr_pass@db:5432/mtr_report_db?schema=public"
      NEXTAUTH_SECRET: "change-this-secret-in-production"
      NEXTAUTH_URL: "http://localhost:3000"
    ports:
      - "3000:3000"
    volumes:
      - ./public:/app/public  # agar logo & upload files persist

volumes:
  postgres_data:
```

- [ ] **Step 4: Commit**

```bash
git add Dockerfile docker-compose.yml next.config.ts
git commit -m "chore: add Dockerfile and docker-compose for PostgreSQL + Next.js deploy"
```

---

## Task 12: Verifikasi Final

- [ ] **Step 1: Jalankan `npm run dev` dan buka browser**

```bash
npm run dev
```

Buka `http://localhost:3000`. Expected:
- Redirect otomatis ke `/dashboard`
- Sidebar kiri dengan logo Bank Nagari (placeholder biru-gold), warna biru navy `#003580`
- Topbar putih dengan badge "Shift A (07:00–15:00)", bell notifikasi, dan avatar "Kurnia Fajri"
- Konten tengah: Card placeholder "Dashboard — Diimplementasikan di Fase 4"
- Klik tiap nav item di sidebar → halaman placeholder masing-masing tampil
- Klik profil → dropdown muncul dengan "Profil & Setting" dan "Keluar"

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: tidak ada error TypeScript.

- [ ] **Step 3: Jalankan Docker Compose (opsional — butuh Docker terinstall)**

```bash
docker-compose up -d db
```

Expected: container PostgreSQL berjalan di port 5432.

- [ ] **Step 4: Commit final**

```bash
git add .
git commit -m "chore: fase 0 complete — shell UI running, design system ready"
```

---

## Instruksi Menjalankan

### Development (lokal)

```bash
cd /Users/user/mtr-Report
npm install
npm run dev
# → Buka http://localhost:3000
```

### Docker (PostgreSQL + App)

```bash
# Hanya database (untuk development):
docker-compose up -d db

# Full stack (production-like):
docker-compose up -d
# → App: http://localhost:3000
# → DB: localhost:5432
```

### Deploy di Proxmox

```bash
# Di VM Proxmox:
git clone <repo> mtr-report
cd mtr-report
cp .env.example .env
# Edit .env: isi NEXTAUTH_SECRET dengan string random
docker-compose up -d
```

---

## Mental Layout Screenshot

```
┌──────────────────────────────────────────────────────────────────┐
│ SIDEBAR (256px, navy #003580)    │ TOPBAR (64px, putih)         │
│                                  │                               │
│ [Logo Bank Nagari]               │ Sistem Monitoring ATM & Jrng │
│  mtr-Report                      │              [Shift A] 🔔 👤 │
│ ─────────────────────            └───────────────────────────────┤
│ MENU UTAMA                        CONTENT AREA                   │
│ ▌ Dashboard      ◄ active         ┌─────────────────────────┐   │
│   Daily Monitoring                │  Dashboard               │   │
│   Open Tiket                      │  Ringkasan open tiket... │   │
│   Rekap Laporan                   │                          │   │
│   Data ATM                        │  [Icon besar]            │   │
│   Suhu / Server                   │  Diimplementasikan       │   │
│   Setting                         │  di Fase 4               │   │
│                                   └─────────────────────────┘   │
│                                                                   │
│ mtr-Report v1.0                                                   │
└──────────────────────────────────────────────────────────────────┘
```

**Warna korporat Bank Nagari yang digunakan:**
- Sidebar: `#003580` (biru navy Bank Nagari)
- Active indicator: `#C8A84B` (gold/emas aksen)
- Topbar: `#FFFFFF` dengan shadow tipis
- Background: `#F4F6FA` (abu sangat muda)
- Cards: `#FFFFFF` dengan shadow card halus

---

## Self-Review: Spec Coverage

| Requirement Fase 0 | Task |
|---|---|
| Next.js App Router + TypeScript | Task 1 |
| Tailwind CSS | Task 1, 2 |
| Prisma | Task 3 |
| Framer Motion | Task 7 (Modal), Task 8 (Sidebar animation) |
| Struktur folder /app, /components, /lib, /prisma, /public | Task 1–10 |
| Design system: palet Bank Nagari | Task 2 |
| Design system: tipografi | Task 2 |
| Komponen: Button, Card, Badge | Task 6 |
| Komponen: Input, Modal, Table | Task 7 |
| Layout shell: sidebar dengan 7 nav items | Task 8 |
| Layout shell: topbar dengan profil + shift | Task 9 |
| .env DATABASE_URL | Task 3 |
| docker-compose db + app | Task 11 |
| `npm run dev` berjalan | Task 12 |
| Shell UI tampil | Task 10, 12 |
