import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface AdminStats {
  total_users: number;
  verified_users: number;
  suspended_users: number;
  new_users_7d: number;
  new_users_30d: number;
  dau: number;
  wau: number;
  mau: number;
  errors_24h: number;
  errors_7d: number;
}

export interface AdminUserRow {
  id: string;
  full_name: string;
  email: string;
  status: "active" | "suspended";
  roles: string[];
  email_confirmed: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  last_seen_at: string | null;
  total_count: number;
}

export async function getAdminStats(): Promise<AdminStats> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_platform_stats");
  if (error) throw new Error(error.message);
  return data as AdminStats;
}

export async function getRegistrationSeries(days = 90) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_registration_series", { p_days: days });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ day: string; registrations: number; active_users: number }>;
}

export async function listUsers(search: string, status: string, page: number, size = 25) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_users", { p_search: search || null, p_status: status || null, p_limit: size, p_offset: (page - 1) * size });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as AdminUserRow[];
  return { rows, total: Number(rows[0]?.total_count ?? 0) };
}
