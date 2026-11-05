import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of use" };

export default function Terms() {
  return (
    <article className="mx-auto max-w-3xl space-y-4 px-4 py-12 text-sm leading-relaxed text-muted sm:px-6 [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground">
      <h1 className="text-2xl font-semibold text-foreground">Terms of use</h1>
      <p>These terms govern your use of FINANCE OS. Operators deploying this software should review and adapt this template with qualified legal counsel for their jurisdiction.</p>
      <h2>1. What FINANCE OS is</h2>
      <p>FINANCE OS is a personal financial planning and tracking tool. It is not a bank, payment service, brokerage, tax adviser or financial adviser. It does not hold money, move money or execute transactions.</p>
      <h2>2. Your account</h2>
      <p>You must provide accurate registration details and keep your password confidential. You are responsible for activity under your account. Accounts are free.</p>
      <h2>3. Your data</h2>
      <p>You own the information you enter. You can export it or delete your account at any time from Settings. See the Privacy Policy for how data is handled.</p>
      <h2>4. Estimates and projections</h2>
      <p>Calculators, goal plans, SIP and repayment projections and insights are estimates based on the values you provide. They are not guarantees or financial advice. Market values are entered manually and may be out of date.</p>
      <h2>5. Acceptable use</h2>
      <p>Do not attempt to access other users&apos; data, disrupt the service, or store banking passwords, card numbers or OTPs in any field.</p>
      <h2>6. Availability</h2>
      <p>The service is provided &quot;as is&quot;. We may perform maintenance, change features, or suspend accounts that violate these terms.</p>
      <h2>7. Liability</h2>
      <p>To the extent permitted by law, the operators are not liable for financial decisions made using the service.</p>
    </article>
  );
}
