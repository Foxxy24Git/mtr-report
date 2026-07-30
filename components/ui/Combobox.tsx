"use client";

import { cn } from "@/lib/cn";
import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

interface ComboboxProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
}

export function Combobox({
  label,
  error,
  hint,
  required,
  disabled,
  className,
  id,
  value,
  onChange,
  options,
  placeholder,
}: ComboboxProps) {
  const autoId = useId();
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-") ?? autoId;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const q = query.trim().toLowerCase();
  // Tanpa ketikan = tampilkan semua opsi (masih bisa scroll manual).
  const filtered = q
    ? options.filter((o) => o.toLowerCase().includes(q))
    : options;

  // Klik di luar komponen menutup dropdown.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) close();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  // Jaga item yang di-highlight tetap terlihat saat navigasi keyboard.
  useEffect(() => {
    if (!open) return;
    const item = listRef.current?.children[highlight] as
      | HTMLElement
      | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  function openList() {
    if (disabled) return;
    setQuery("");
    const idx = options.indexOf(value);
    setHighlight(idx >= 0 ? idx : 0);
    setOpen(true);
  }

  function pick(option: string) {
    onChange(option);
    close();
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return openList();
      if (filtered.length === 0) return;
      setHighlight((h) => {
        const next = e.key === "ArrowDown" ? h + 1 : h - 1;
        return (next + filtered.length) % filtered.length;
      });
      return;
    }
    if (e.key === "Enter") {
      if (open) {
        // Cegah submit form saat sedang memilih opsi.
        e.preventDefault();
        const option = filtered[highlight];
        if (option) pick(option);
      }
      return;
    }
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        close();
      }
      return;
    }
    if (e.key === "Tab") close();
  }

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div className="relative" ref={wrapperRef}>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${inputId}-listbox`}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          // Saat tertutup kotak menampilkan label opsi terpilih, persis <select>.
          value={open ? query : value}
          placeholder={open && value ? value : placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
            if (!open) setOpen(true);
          }}
          onMouseDown={() => {
            if (!open) openList();
          }}
          onFocus={() => {
            if (!open) openList();
          }}
          onKeyDown={onKeyDown}
          className={cn(
            "w-full pl-3 pr-9 py-2 text-sm rounded-md border bg-white",
            "placeholder:text-gray-400",
            "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
            "transition-colors duration-150",
            error
              ? "border-red-400 focus:ring-red-200 focus:border-red-500"
              : "border-gray-300 hover:border-gray-400",
            "disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed",
            className
          )}
        />
        <ChevronDown
          className={cn(
            "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 transition-transform duration-150",
            open && "rotate-180"
          )}
        />

        {open && filtered.length > 0 && (
          <div
            ref={listRef}
            id={`${inputId}-listbox`}
            role="listbox"
            className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-md border border-gray-200 bg-white shadow-card-lg"
          >
            {filtered.map((option, i) => (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={option === value}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(option)}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm transition-colors border-b border-gray-50 last:border-0",
                  i === highlight ? "bg-primary-50" : "hover:bg-primary-50",
                  option === value
                    ? "font-medium text-primary"
                    : "text-gray-900"
                )}
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </div>

      {open && q && filtered.length === 0 && (
        <p className="text-xs text-gray-500">Tidak ditemukan.</p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );
}
