import "server-only";

export const serverEnv = {
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "",
};

export function isServiceRoleConfigured(): boolean {
  return Boolean(serverEnv.serviceRoleKey);
}

export function isEmailConfigured(): boolean {
  return Boolean(serverEnv.resendApiKey && serverEnv.emailFrom);
}
