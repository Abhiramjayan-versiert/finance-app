/** Cookie that tells the server to render the app-lock screen first (browsers & desktop). Not sensitive. */
export const LOCK_COOKIE = "fos_lock";
/** Session-only, httpOnly marker set after sign-in or a successful unlock; cleared when the app re-locks. */
export const UNLOCKED_COOKIE = "__fos_unlocked";
