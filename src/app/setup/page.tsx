import { isBackendConfigured } from "@/lib/env";
import { Logo } from "@/components/shared/logo";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Shown only when the deployment is missing its Firebase configuration. */
export default function Setup() {
  if (isBackendConfigured()) redirect("/");
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-6">
      <Logo />
      <h1 className="text-xl font-semibold">Finish configuring FINANCE OS</h1>
      <p className="text-sm text-muted">This deployment has no Firebase connection yet. Add these environment variables in Vercel and redeploy:</p>
      <pre className="overflow-x-auto rounded-md border border-border bg-card p-3 text-xs">FIREBASE_PROJECT_ID{"\n"}FIREBASE_CLIENT_EMAIL{"\n"}FIREBASE_PRIVATE_KEY{"\n"}FIREBASE_WEB_API_KEY{"\n"}NEXT_PUBLIC_SITE_URL</pre>
      <p className="text-sm text-muted">See <code>docs/DEPLOYMENT.md</code> for the full guide.</p>
    </div>
  );
}
