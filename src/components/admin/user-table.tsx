"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Ban, MoreVertical, RotateCcw, Search, Shield, ShieldOff, Trash2 } from "lucide-react";
import { ActionForm, SubmitButton, TextField, type FormAction } from "@/components/forms/action-form";
import { useAction } from "@/components/forms/use-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { deleteUserAction, reactivateUserAction, setRoleAction, suspendUserAction } from "@/server/actions/admin";
import type { AdminUserRow } from "@/server/queries/admin";

export function UserFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp.toString());
    if (v) n.set(k, v);
    else n.delete(k);
    n.delete("page");
    router.replace(`${pathname}?${n.toString()}`);
  };
  return (
    <div className="flex flex-wrap gap-2">
      <div className="relative min-w-56 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input className="pl-9" placeholder="Search name or email" defaultValue={sp.get("q") ?? ""} aria-label="Search users" onKeyDown={(e) => e.key === "Enter" && set("q", (e.target as HTMLInputElement).value)} />
      </div>
      <NativeSelect className="w-auto" aria-label="Status filter" value={sp.get("status") ?? ""} onChange={(e) => set("status", e.target.value)}>
        <option value="">All users</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive (30d+)</option>
        <option value="unverified">Unverified</option>
        <option value="suspended">Suspended</option>
      </NativeSelect>
    </div>
  );
}

export function UserTable({ rows, isSuper, selfId }: { rows: AdminUserRow[]; isSuper: boolean; selfId: string }) {
  const { run } = useAction();
  const [dlg, setDlg] = useState<null | { kind: "suspend" | "delete"; user: AdminUserRow }>(null);
  const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString() : "—");
  return (
    <>
      <Table>
        <THead><tr><TH>User</TH><TH>Status</TH><TH className="hidden md:table-cell">Joined</TH><TH className="hidden md:table-cell">Last active</TH><TH /></tr></THead>
        <tbody>
          {rows.map((u) => (
            <TR key={u.id}>
              <TD>
                <span className="font-medium">{u.full_name || "—"}</span>
                <span className="block text-xs text-muted">{u.email}</span>
                <span className="mt-1 flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r} variant="accent">{r.replace("_", " ")}</Badge>)}</span>
              </TD>
              <TD>
                <div className="flex flex-wrap gap-1">
                  <Badge variant={u.status === "suspended" ? "danger" : "success"}>{u.status}</Badge>
                  {!u.email_confirmed ? <Badge variant="warning">unverified</Badge> : null}
                </div>
              </TD>
              <TD className="hidden text-xs text-muted md:table-cell">{fmt(u.created_at)}</TD>
              <TD className="hidden text-xs text-muted md:table-cell">{fmt(u.last_seen_at ?? u.last_sign_in_at)}</TD>
              <TD className="text-right">
                {u.id !== selfId ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Manage ${u.email}`}><MoreVertical /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {u.status === "suspended" ? <DropdownMenuItem onSelect={() => run(() => reactivateUserAction(u.id))}><RotateCcw /> Reactivate</DropdownMenuItem> : <DropdownMenuItem onSelect={() => setDlg({ kind: "suspend", user: u })}><Ban /> Suspend</DropdownMenuItem>}
                      {isSuper ? (
                        <>
                          <DropdownMenuSeparator />
                          {(["admin", "support", "super_admin"] as const).map((role) =>
                            u.roles.includes(role) ? (
                              <DropdownMenuItem key={role} onSelect={() => run(() => setRoleAction(u.id, role, false))}><ShieldOff /> Revoke {role.replace("_", " ")}</DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem key={role} onSelect={() => run(() => setRoleAction(u.id, role, true))}><Shield /> Grant {role.replace("_", " ")}</DropdownMenuItem>
                            ),
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem destructive onSelect={() => setDlg({ kind: "delete", user: u })}><Trash2 /> Delete account</DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : <span className="text-xs text-muted">You</span>}
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
      <Dialog open={!!dlg} onOpenChange={(o) => !o && setDlg(null)}>
        {dlg?.kind === "suspend" ? (
          <DialogContent title={`Suspend ${dlg.user.email}?`} description="The user is signed out and cannot sign in until reactivated. Their data is kept.">
            <ActionForm action={suspendUserAction as unknown as FormAction} onSuccess={() => setDlg(null)}>
              <input type="hidden" name="userId" value={dlg.user.id} />
              <TextField label="Reason (recorded in the audit log)" name="reason" maxLength={300} />
              <div className="flex justify-end"><SubmitButton variant="danger">Suspend user</SubmitButton></div>
            </ActionForm>
          </DialogContent>
        ) : dlg?.kind === "delete" ? (
          <DialogContent title="Permanently delete this account?" description="This erases the user and all their data. It cannot be undone and is recorded in the audit log.">
            <ActionForm action={deleteUserAction as unknown as FormAction} onSuccess={() => setDlg(null)}>
              <input type="hidden" name="userId" value={dlg.user.id} />
              <TextField label={`Type ${dlg.user.email} to confirm`} name="confirmEmail" autoComplete="off" />
              <div className="flex justify-end"><SubmitButton variant="danger">Delete permanently</SubmitButton></div>
            </ActionForm>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}
