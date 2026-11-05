"use server";

import { revalidatePath } from "next/cache";
import { actionWorkspace } from "@/lib/auth";
import { getStore } from "@/lib/firebase/admin";
import { userPath } from "@/lib/firebase/store";
import { uuid } from "@/lib/validation/common";
import { fail, guarded, ok, type ActionResult } from "@/lib/security/actions";

export async function markNotificationsReadAction(id?: string): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const store = getStore();
    const now = new Date().toISOString();
    if (id) {
      if (!uuid.safeParse(id).success) return fail("Invalid notification");
      const path = userPath(ws.userId, "notifications", id);
      if (!(await store.get(path))) return fail("Notification not found");
      await store.update(path, { read_at: now });
    } else {
      for (const n of await store.list(userPath(ws.userId, "notifications"), { where: [["read_at", "==", null]] })) await store.update(userPath(ws.userId, "notifications", n.id), { read_at: now });
    }
    revalidatePath("/", "layout");
    return ok(id ? undefined : "All caught up");
  }, "markRead");
}

export async function deleteNotificationAction(id: string): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (!uuid.safeParse(id).success) return fail("Invalid notification");
    await getStore().delete(userPath(ws.userId, "notifications", id));
    revalidatePath("/", "layout");
    return ok();
  }, "deleteNotification");
}
