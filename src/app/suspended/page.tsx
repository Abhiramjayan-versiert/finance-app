import { ShieldAlert } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/server/actions/auth";

export default function Suspended() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo />
      <ShieldAlert className="size-8 text-danger" />
      <h1 className="text-xl font-semibold">This account is suspended</h1>
      <p className="max-w-md text-sm text-muted">Access has been paused by an administrator. Your data has not been deleted. Please contact support if you believe this is a mistake.</p>
      <form action={logoutAction}><Button variant="secondary" type="submit">Sign out</Button></form>
    </div>
  );
}
