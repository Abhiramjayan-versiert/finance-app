package com.versiert.financeos;

import android.webkit.CookieManager;

import com.getcapacitor.BridgeActivity;

/**
 * FINANCE OS Android shell.
 *
 * Android's WebView keeps new cookies in memory and only writes them to disk
 * periodically. If the app is closed before that happens (swiped away, or
 * exited with the back button), the sign-in cookie is lost and the user is
 * signed out. Flushing whenever the app leaves the foreground keeps people
 * signed in across restarts.
 */
public class MainActivity extends BridgeActivity {
    private static void persistCookies() {
        try {
            CookieManager.getInstance().flush();
        } catch (Exception ignored) {
            // WebView not initialised yet — nothing to persist.
        }
    }

    @Override
    public void onPause() {
        persistCookies();
        super.onPause();
    }

    @Override
    public void onStop() {
        persistCookies();
        super.onStop();
    }

    @Override
    public void onDestroy() {
        persistCookies();
        super.onDestroy();
    }
}
