package com.nora.tunnel;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Talks to the NORA TUNNEL control plane.
 *
 * The server owns validation, routing and history; this client only asks for a
 * configuration that has already passed structural validation and reports back what
 * the real core measured. Failed requests surface as exceptions with the real HTTP
 * status and body, never as a silently assumed state.
 */
public final class ControlPlane {
    public static final class Profile {
        public int id;
        public String name = "";
        public String group = "";
        public String protocol = "";
        public String core = "";
        public String transport = "";
        public String security = "";
        public String server = "";
        public int port;
        public String validationStatus = "unknown";
        public int validationScore;
        public int lastLatency;
    }

    public static final class Envelope {
        public String configJson = "";
        public String tunAddress = "";
        public String tunAddress6 = "";
        public String dns = "";
        public int mtu = 9000;
        public List<String> includePackages = new ArrayList<>();
        public List<String> excludePackages = new ArrayList<>();
        public String endpoint = "";
        public String profileName = "";
        public int profileId;
        public String coreVersion = "";
        public String warnings = "";
    }

    private ControlPlane() {}

    private static String base(Context context) {
        String configured = Prefs.url(context);
        if (configured == null || configured.isEmpty()) {
            throw new IllegalStateException("No control-plane URL configured on this device.");
        }
        String url = configured.trim();
        while (url.endsWith("/")) {
            url = url.substring(0, url.length() - 1);
        }
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = "https://" + url;
        }
        return url;
    }

    private static String read(InputStream stream) throws Exception {
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line).append('\n');
            }
        }
        return builder.toString();
    }

    private static String request(Context context, String path, String method, String body) throws Exception {
        URL url = new URL(base(context) + path);
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setRequestMethod(method);
        connection.setConnectTimeout(8000);
        connection.setReadTimeout(20000);
        connection.setRequestProperty("accept", "application/json");
        String token = Prefs.token(context);
        if (token != null && !token.isEmpty()) {
            connection.setRequestProperty("x-nora-device", token);
        }
        connection.setRequestProperty("x-nora-device-key", Prefs.deviceKey(context));
        if (body != null) {
            connection.setDoOutput(true);
            connection.setRequestProperty("content-type", "application/json");
            try (OutputStream stream = connection.getOutputStream()) {
                stream.write(body.getBytes(StandardCharsets.UTF_8));
            }
        }
        int status = connection.getResponseCode();
        InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
        String payload = stream == null ? "" : read(new BufferedInputStream(stream));
        connection.disconnect();
        if (status >= 400) {
            throw new IllegalStateException("HTTP " + status + " from " + path + (payload.isEmpty() ? "" : ": " + payload.substring(0, Math.min(180, payload.length()))));
        }
        return payload;
    }

    /** Real reachability check used by the UI before anything is started. */
    public static String health(Context context) throws Exception {
        return request(context, "/api/health", "GET", null);
    }

    public static List<Profile> profiles(Context context) throws Exception {
        String payload = request(context, "/api/device/profiles", "GET", null);
        JSONObject json = new JSONObject(payload);
        JSONArray array = json.optJSONArray("profiles");
        List<Profile> profiles = new ArrayList<>();
        if (array == null) {
            return profiles;
        }
        for (int index = 0; index < array.length(); index += 1) {
            JSONObject item = array.getJSONObject(index);
            Profile profile = new Profile();
            profile.id = item.optInt("id");
            profile.name = item.optString("name");
            profile.group = item.optString("group");
            profile.protocol = item.optString("protocol");
            profile.core = item.optString("core");
            profile.transport = item.optString("transport");
            profile.security = item.optString("securityLayer");
            profile.server = item.optString("serverAddress");
            profile.port = item.optInt("serverPort");
            profile.validationStatus = item.optString("validationStatus", "unknown");
            profile.validationScore = item.optInt("validationScore");
            profile.lastLatency = item.optInt("latencyMs");
            profiles.add(profile);
        }
        return profiles;
    }

    /** Fetches an already-validated core configuration plus its TUN parameters. */
    public static Envelope envelope(Context context, int profileId) throws Exception {
        String payload = request(context, "/api/device/config?id=" + profileId, "GET", null);
        JSONObject json = new JSONObject(payload);
        Envelope envelope = new Envelope();
        envelope.profileId = json.optInt("profileId", profileId);
        envelope.profileName = json.optString("profileName");
        envelope.endpoint = json.optString("endpoint");
        envelope.coreVersion = json.optString("coreVersion");
        envelope.warnings = json.optString("warnings");
        JSONObject tun = json.optJSONObject("tun");
        if (tun != null) {
            envelope.tunAddress = tun.optString("address");
            envelope.tunAddress6 = tun.optString("address6");
            envelope.dns = tun.optString("dns");
            envelope.mtu = tun.optInt("mtu", 9000);
            JSONArray include = tun.optJSONArray("includePackages");
            if (include != null) {
                for (int index = 0; index < include.length(); index += 1) {
                    envelope.includePackages.add(include.getString(index));
                }
            }
            JSONArray exclude = tun.optJSONArray("excludePackages");
            if (exclude != null) {
                for (int index = 0; index < exclude.length(); index += 1) {
                    envelope.excludePackages.add(exclude.getString(index));
                }
            }
        }
        envelope.configJson = json.optString("config");
        if (envelope.configJson.isEmpty()) {
            throw new IllegalStateException("Control plane returned no configuration for profile " + profileId);
        }
        Prefs.cacheConfig(context, envelope.configJson);
        return envelope;
    }

    public static String cachedConfig(Context context) {
        return Prefs.cachedConfig(context);
    }

    /** Reports the state and counters measured by the real core. */
    public static void report(Context context, JSONObject body) throws Exception {
        request(context, "/api/device/report", "POST", body.toString());
    }
}
