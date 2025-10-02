"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cog, Cpu, PlayCircle, Settings2 } from "lucide-react";

import { cn } from "@/lib/utils";

const navigation = [
  {
    section: "Configuration",
    items: [
      {
        label: "Simulation Bridge",
        href: "/config/simulation-bridge",
        icon: Cog,
      },
      {
        label: "AnyLogic",
        href: "/config/anylogic",
        icon: Settings2,
      },
      {
        label: "MATLAB",
        href: "/config/matlab",
        icon: Cpu,
      },
    ],
  },
  {
    section: "Execution",
    items: [
      {
        label: "Simulation runtime",
        href: "/execution",
        icon: PlayCircle,
      },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden h-screen w-64 shrink-0 border-r border-zinc-200 bg-white/90 px-5 py-6 md:flex md:flex-col">
      <div className="mb-10 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-semibold">
          SB
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold">Simulation Bridge</span>
          <span className="text-xs text-zinc-500">Control Console</span>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-8 text-sm">
        {navigation.map((section) => (
          <div key={section.section} className="space-y-3">
            <p className="text-xs font-medium uppercase text-zinc-500">
              {section.section}
            </p>
            <div className="flex flex-col gap-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-zinc-900/10 text-zinc-900"
                        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
