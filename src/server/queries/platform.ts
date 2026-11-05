import "server-only";
import { cache } from "react";
import { getStore } from "@/lib/firebase/admin";
import { isBackendConfigured } from "@/lib/env";
import { DEFAULT_PLATFORM_SETTINGS } from "@/server/data/defaults";
import { getPlatformSettings } from "@/server/data/users";

export type PublicSettings = typeof DEFAULT_PLATFORM_SETTINGS;

export const getPublicSettings = cache(async (): Promise<PublicSettings> => {
  if (!isBackendConfigured()) return DEFAULT_PLATFORM_SETTINGS;
  try {
    return await getPlatformSettings(getStore());
  } catch {
    return DEFAULT_PLATFORM_SETTINGS;
  }
});
