import "server-only";
import { userPath, type Store } from "@/lib/firebase/store";
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES, DEFAULT_NOTIFICATION_PREFS, DEFAULT_PLATFORM_SETTINGS } from "./defaults";
import type { Profile, UserSettings } from "@/types/database";

export const DEFAULT_SETTINGS: Omit<UserSettings, "user_id"> = {
  currency: "INR",
  locale: "en-IN",
  timezone: "Asia/Kolkata",
  date_format: "dd/MM/yyyy",
  fy_start_month: 4,
  theme: "dark",
  opening_balance_minor: 0,
  net_worth_cash_source: "tracked",
  default_payment_method: "upi",
  notification_prefs: DEFAULT_NOTIFICATION_PREFS,
};

export interface UserDoc extends Omit<Profile, "id"> {
  roles: string[];
  settings: Omit<UserSettings, "user_id">;
}

export async function getPlatformSettings(store: Store) {
  const doc = await store.get<typeof DEFAULT_PLATFORM_SETTINGS>("platform/settings");
  return { ...DEFAULT_PLATFORM_SETTINGS, ...(doc ?? {}) };
}

/** Admin-managed default categories (falls back to the built-in list). */
export async function getDefaultCategories(store: Store) {
  const custom = await store.list<{ kind: "income" | "expense"; name: string; color: string; is_active: boolean }>("default_categories");
  if (!custom.length) {
    return [
      ...DEFAULT_EXPENSE_CATEGORIES.map(([name, color], i) => ({ id: `e${i}`, kind: "expense" as const, name, color, is_active: true })),
      ...DEFAULT_INCOME_CATEGORIES.map(([name, color], i) => ({ id: `i${i}`, kind: "income" as const, name, color, is_active: true })),
    ];
  }
  return custom;
}

/** Creates the user's private workspace: profile/settings document + copies of default categories. */
export async function bootstrapWorkspace(store: Store, uid: string, email: string, fullName: string) {
  if (await store.get(userPath(uid))) return;
  const now = new Date().toISOString();
  const cats = (await getDefaultCategories(store)).filter((c) => c.is_active);
  await store.transaction(async (tx) => {
    tx.create(userPath(uid), {
      full_name: fullName.slice(0, 120),
      email,
      avatar_url: null,
      country: "IN",
      status: "active",
      suspended_reason: null,
      terms_accepted_at: now,
      onboarded_at: null,
      last_seen_at: null,
      created_at: now,
      deleted_at: null,
      roles: [],
      settings: DEFAULT_SETTINGS,
    } satisfies UserDoc);
    for (const c of cats) {
      const col = c.kind === "income" ? "income_categories" : "expense_categories";
      tx.create(userPath(uid, col, store.newId()), { user_id: uid, name: c.name, icon: "circle", color: c.color, is_default: true, archived: false, parent_id: null, created_at: now });
    }
  });
}
