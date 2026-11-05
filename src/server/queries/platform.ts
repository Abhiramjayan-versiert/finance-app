import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface PublicSettings {
  maintenance_mode: boolean;
  maintenance_message: string;
  signups_enabled: boolean;
  announcement: string;
}

const DEFAULTS: PublicSettings = { maintenance_mode: false, maintenance_message: "FINANCE OS is undergoing scheduled maintenance.", signups_enabled: true, announcement: "" };

export const getPublicSettings = cache(async (): Promise<PublicSettings> => {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("platform_settings").select("key, value").eq("is_public", true);
    const out = { ...DEFAULTS } as Record<string, unknown>;
    for (const row of data ?? []) out[row.key] = row.value;
    return out as unknown as PublicSettings;
  } catch {
    return DEFAULTS;
  }
});
