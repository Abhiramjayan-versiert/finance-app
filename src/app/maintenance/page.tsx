import { Wrench } from "lucide-react";
import { getPublicSettings } from "@/server/queries/platform";
import { Logo } from "@/components/shared/logo";

export const dynamic = "force-dynamic";

export default async function Maintenance() {
  const s = await getPublicSettings();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo />
      <Wrench className="size-8 text-accent" />
      <h1 className="text-xl font-semibold">We&apos;ll be right back</h1>
      <p className="max-w-md text-sm text-muted">{s.maintenance_message}</p>
      <p className="text-xs text-muted">Your data is safe.</p>
    </div>
  );
}
