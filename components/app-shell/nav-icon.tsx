import { CalendarDays, Inbox, KanbanSquare, LayoutDashboard, Settings, Users, Workflow } from "lucide-react";
import type { NavItem } from "@/lib/routes";

const ICONS = {
  dashboard: LayoutDashboard,
  inbox: Inbox,
  pipeline: KanbanSquare,
  contacts: Users,
  calendar: CalendarDays,
  workflows: Workflow,
  settings: Settings,
} as const;

/** Lucide icons, 20px, 1.75 stroke (BRAND.md §4). */
export function NavIcon({ name, size = 20 }: { name: NavItem["icon"]; size?: number }) {
  const Icon = ICONS[name];
  return <Icon size={size} strokeWidth={1.75} aria-hidden />;
}
