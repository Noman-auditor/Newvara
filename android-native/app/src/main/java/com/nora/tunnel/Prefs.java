package com.nora.tunnel;

import android.content.Context;
import android.content.SharedPreferences;

/** Local device settings. Nothing here fakes tunnel state; it only stores user intent. */
public final class Prefs {
    private static final String FILE = "nora_prefs";

    public static final String KEY_URL = "control_plane_url";
    public static final String KEY_DEVICE = "device_key";
    public static final String KEY_PROFILE = "selected_profile_id";
    public static final String KEY_PROFILE_NAME = "selected_profile_name";
    public static final String KEY_AUTO_CONNECT = "auto_connect";
    public static final String KEY_BOOT_START = "boot_start";
    public static final String KEY_CACHED_CONFIG = "cached_config";
    public static final String KEY_CACHED_ENVELOPE = "cached_envelope";
    public static final String KEY_LAST_STATE = "last_state";
    public static final String KEY_TOKEN = "device_token";

    private Prefs() {}

    public static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    public static String url(Context context) {
        return prefs(context).getString(KEY_URL, "");
    }

    public static String token(Context context) {
        return prefs(context).getString(KEY_TOKEN, "");
    }

    public static String deviceKey(Context context) {
        return prefs(context).getString(KEY_DEVICE, "");
    }

    public static int profileId(Context context) {
        return prefs(context).getInt(KEY_PROFILE, 0);
    }

    public static String profileName(Context context) {
        return prefs(context).getString(KEY_PROFILE_NAME, "");
    }

    public static boolean autoConnect(Context context) {
        return prefs(context).getBoolean(KEY_AUTO_CONNECT, false);
    }

    public static boolean bootStart(Context context) {
        return prefs(context).getBoolean(KEY_BOOT_START, false);
    }

    public static String cachedConfig(Context context) {
        return prefs(context).getString(KEY_CACHED_CONFIG, "");
    }

    public static void save(Context context, String url, String token, int profileId, String profileName, boolean autoConnect, boolean bootStart) {
        prefs(context).edit()
                .putString(KEY_URL, url == null ? "" : url.trim())
                .putString(KEY_TOKEN, token == null ? "" : token.trim())
                .putInt(KEY_PROFILE, profileId)
                .putString(KEY_PROFILE_NAME, profileName == null ? "" : profileName)
                .putBoolean(KEY_AUTO_CONNECT, autoConnect)
                .putBoolean(KEY_BOOT_START, bootStart)
                .apply();
    }

    public static void cacheConfig(Context context, String configJson) {
        prefs(context).edit().putString(KEY_CACHED_CONFIG, configJson).apply();
    }

    public static void saveState(Context context, String state) {
        prefs(context).edit().putString(KEY_LAST_STATE, state).apply();
    }

    public static String lastState(Context context) {
        return prefs(context).getString(KEY_LAST_STATE, "idle");
    }
}
