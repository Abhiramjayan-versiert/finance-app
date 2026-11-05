import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy policy" };

export default function Privacy() {
  return (
    <article className="mx-auto max-w-3xl space-y-4 px-4 py-12 text-sm leading-relaxed text-muted sm:px-6 [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground">
      <h1 className="text-2xl font-semibold text-foreground">Privacy policy</h1>
      <p>This template describes how the FINANCE OS software handles data. Operators should adapt it to their deployment and legal obligations.</p>
      <h2>Data we store</h2>
      <p>Account details (name, email), preferences, and the financial records you choose to enter: transactions, budgets, goals, savings, investments, debts, assets and liabilities, plus optional receipt and image uploads.</p>
      <h2>Data we never collect</h2>
      <p>Bank or card credentials, OTPs, or access to your bank accounts. FINANCE OS does not connect to financial institutions.</p>
      <h2>Who can see your data</h2>
      <p>Only you. Your records are stored under your own account path and are only ever read by the server for your verified session; direct database access from browsers is blocked by Firestore security rules. Administrators can see account metadata (name, email, sign-up date, activity dates) for support and security, but not your financial records. Privileged administrative actions are recorded in an audit log.</p>
      <h2>Processors</h2>
      <p>Data is hosted with Google Firebase (Firestore database and Firebase Authentication) and served via Vercel. If email notifications are enabled, an email provider (Resend) receives your email address and notification text.</p>
      <h2>Offline storage</h2>
      <p>The installable app caches only the public application shell. Entries you create while offline are kept on your device until they sync, and are cleared when you sign out.</p>
      <h2>Your rights</h2>
      <p>Export all your data as JSON or CSV, correct it at any time, and permanently delete your account and data from Settings.</p>
    </article>
  );
}
