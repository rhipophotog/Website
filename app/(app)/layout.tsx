import { AppShell } from "@/components/app-shell/app-shell";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return <AppShell user={user}>{children}</AppShell>;
}
