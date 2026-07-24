"use client";

/**
 * Sub-navegación compartida de la sección FCIs.
 * Se renderiza dentro del hero oscuro de cada vista (variante "onDark").
 * Marca la pestaña activa con usePathname.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/fondos", label: "Fondos" },
  { href: "/fondos/comparar", label: "Comparar" },
  { href: "/fondos/flujos", label: "Flujos" },
  { href: "/fondos/tenencias", label: "Tenencias" },
  { href: "/fondos/negocio", label: "Negocio" },
];

export default function FciTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-6 overflow-x-auto -mb-px scrollbar-none" aria-label="Secciones de FCIs">
      {TABS.map((t) => {
        const active =
          t.href === "/fondos"
            ? pathname === "/fondos" || pathname.startsWith("/fondo/")
            : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`whitespace-nowrap py-3 text-[13px] font-bold uppercase tracking-wider border-b-2 transition-colors ${
              active
                ? "border-amauta-yellow text-text-primary"
                : "border-transparent text-text-tertiary hover:text-text-secondary"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
