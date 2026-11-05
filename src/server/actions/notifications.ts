"use server";

import { revalidatePath } from "next/cache";
import { actionWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation/common";
import { dbErrorMessage, fail, guarded, ok, type ActionResult } from "@/lib/security/actions";

export async function markNotificationsReadAction(id?: string): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const supabase = await createClient();
    let q = supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", ws.userId).is("read_at", null);
    if (id) {
      if (!uuid.safeParse(id).success) return fail("Invalid notification");
      q = q.eq("id", id);
    }
    const { error } = await q;
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/", "layout");
    return ok(id ? undefined : "All caught up");
  }, "markRead");
}

export async function deleteNotificationAction(id: string): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (!uuid.safeParse(id).success) return fail("Invalid notification");
    const supabase = await createClient();
    const { error } = await supabase.from("notifications").delete().eq("id", id).eq("user_id", ws.userId);
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/", "layout");
    return ok();
  }, "deleteNotification");
}
