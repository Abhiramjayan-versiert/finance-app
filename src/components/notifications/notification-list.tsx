"use client";

import Link from "next/link";
import { CheckCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/forms/use-action";
import { EmptyState } from "@/components/shared/states";
import { deleteNotificationAction, markNotificationsReadAction } from "@/server/actions/notifications";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/types/database";

export function NotificationList({ items }: { items: AppNotification[] }) {
  const { run, pending } = useAction();
  if (!items.length) return <EmptyState title="No notifications" description="Budget warnings, goal deadlines, EMI reminders and milestones appear here." />;
  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button variant="secondary" size="sm" disabled={pending || items.every((i) => i.read_at)} onClick={() => run(() => markNotificationsReadAction())}><CheckCheck /> Mark all read</Button>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {items.map((n) => (
          <li key={n.id} className={cn("flex items-start gap-3 p-4", !n.read_at && "bg-accent-soft/40")}>
            <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-accent")} aria-label={n.read_at ? undefined : "Unread"} />
            <div className="min-w-0 flex-1">
              {n.link ? (
                <Link href={n.link} onClick={() => !n.read_at && run(() => markNotificationsReadAction(n.id))} className="text-sm font-medium hover:underline">{n.title}</Link>
              ) : (
                <p className="text-sm font-medium">{n.title}</p>
              )}
              <p className="mt-0.5 text-xs text-muted">{n.body}</p>
              <p className="mt-1 text-[11px] text-muted">{new Date(n.created_at).toLocaleString()}{n.emailed_at ? " · emailed" : ""}</p>
            </div>
            <div className="flex gap-1">
              {!n.read_at ? <Button variant="ghost" size="icon-sm" aria-label="Mark read" onClick={() => run(() => markNotificationsReadAction(n.id))}><CheckCheck /></Button> : null}
              <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => run(() => deleteNotificationAction(n.id))}><Trash2 /></Button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
