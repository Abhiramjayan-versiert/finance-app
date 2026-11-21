import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Delete your account", description: "How to permanently delete your FINANCE OS account and all of its data." };

/** Public account-deletion instructions (required by Google Play). */
export default function DeleteAccount() {
  return (
    <article className="mx-auto max-w-2xl space-y-4 px-4 py-12 text-sm leading-relaxed text-muted sm:px-6 [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground">
      <h1 className="text-2xl font-semibold text-foreground">Delete your FINANCE OS account</h1>
      <p>You can permanently delete your account and every record in it at any time, from the phone app or any web browser.</p>
      <h2>Steps</h2>
      <ol className="ml-5 list-decimal space-y-1.5">
        <li><Link className="text-accent underline" href="/login?next=/settings%23data">Sign in</Link> to FINANCE OS.</li>
        <li>Open <b className="text-foreground">Settings</b> → <b className="text-foreground">Your data</b>.</li>
        <li>Optional: tap <b className="text-foreground">Export all data</b> to keep a copy.</li>
        <li>Tap <b className="text-foreground">Delete my account</b>, type <b className="text-foreground">DELETE</b> to confirm, and enter your password.</li>
      </ol>
      <h2>What gets deleted</h2>
      <p>Your profile, sign-in, settings and all financial records — transactions, budgets, goals, savings, investments, debts, assets, liabilities, notifications and uploaded receipts or images. Deletion is immediate and cannot be undone.</p>
      <h2>What we keep</h2>
      <p>A security log line recording that an account was deleted, and when. It contains no financial data, name or email address.</p>
      <h2>Can&apos;t sign in?</h2>
      <p>Use <Link className="text-accent underline" href="/forgot-password">Forgot password</Link> to regain access first, then follow the steps above.</p>
    </article>
  );
}
