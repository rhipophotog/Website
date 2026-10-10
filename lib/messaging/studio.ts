import { appUrl } from "@/lib/env";

type StudioSettings = { owner_name?: string | null; booking_link?: string | null; portfolio_link?: string | null; review_link?: string | null };

/** Studio settings with defaults filled in: {{booking_link}} falls back to the built-in booking page. */
export function withStudioDefaults<T extends StudioSettings>(settings: T | null | undefined): StudioSettings {
  return { ...(settings ?? {}), booking_link: settings?.booking_link || `${appUrl()}/book/discovery` };
}
