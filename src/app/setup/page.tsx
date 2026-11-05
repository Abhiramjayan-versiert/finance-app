import { isSupabaseConfigured } from "@/lib/env";
import { Logo } from "@/components/shared/logo";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Shown only when the deployment is missing its Supabase configuration. */
export default function Setup() {
  if (isSupabaseConfigured()) redirect("/");
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-6">
      <Logo />
      <h1 className="text-xl font-semibold">Finish configuring FINANCE OS</h1>
      <p className="text-sm text-muted">This deployment has no Supabase connection yet. Add these environment variables and redeploy:</p>
      <pre className="overflow-x-auto rounded-md border border-border bg-card p-3 text-xs">NEXT_PUBLIC_SUPABASE_URL{"\n"}NEXT_PUBLIC_SUPABASE_ANON_KEY{"\n"}SUPABASE_SERVICE_ROLE_KEY{"\n"}NEXT_PUBLIC_SITE_URL</pre>
      <p className="text-sm text-muted">See <code>docs/DEPLOYMENT.md</code> for the full guide.</p>
    </div>
  );
}
