package com.nora.tunnel;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.VpnService;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.ParcelFileDescriptor;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Real Android VpnService host for the bundled sing-box core.
 *
 * Lifecycle: prepare() -> establish TUN with the parameters the control plane
 * computed -> hand the validated config to the core -> poll the core's own
 * traffic totals -> report the real numbers back to the control plane.
 *
 * If any step fails the service stops and publishes an explicit error; it never
 * reports "connected" without a live core and a live TUN.
 */
public class NoraVpnService extends VpnService {
    public static final String ACTION_START = "com.nora.tunnel.START";
    public static final String ACTION_STOP = "com.nora.tunnel.STOP";
    public static final String ACTION_RELOAD = "com.nora.tunnel.RELOAD";

    private static final String CHANNEL_ID = "nora_tunnel_session";
    private static final int NOTIFICATION_ID = 4711;
    private static final long REPORT_INTERVAL_MS = 15000L;

    private static volatile boolean running;

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler ui = new Handler(Looper.getMainLooper());
    private ParcelFileDescriptor tunDescriptor;
    private volatile boolean reportTickRunning;

    public static boolean isRunning() {
        return running;
    }

    public static void start(Context context) {
        Intent intent = new Intent(context, NoraVpnService.class).setAction(ACTION_START);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    public static void stop(Context context) {
        Intent intent = new Intent(context, NoraVpnService.class).setAction(ACTION_STOP);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return super.onBind(intent);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null || intent.getAction() == null ? ACTION_START : intent.getAction();
        createChannel();
        startForeground(NOTIFICATION_ID, buildNotification());

        switch (action) {
            case ACTION_STOP:
                io.execute(this::shutdown);
                break;
            case ACTION_RELOAD:
                io.execute(() -> {
                    shutdownCore();
                    connect();
                });
                break;
            default:
                io.execute(this::connect);
        }
        return START_STICKY;
    }

    /* ------------------------------- connect ------------------------------- */

    private void connect() {
        if (running) {
            TunnelState.log("[vpn] already running — ignoring duplicate start");
            return;
        }
        int profileId = Prefs.profileId(this);
        if (profileId == 0) {
            fail("No profile selected. Fetch the inventory from the control plane and pick one.");
            return;
        }

        TunnelState.setState(TunnelState.PREPARING, "Asking the control plane for a validated configuration…");
        TunnelState.resetCounters();
        TunnelState.setProfile(profileId, Prefs.profileName(this));

        ControlPlane.Envelope envelope;
        try {
            envelope = ControlPlane.envelope(this, profileId);
            TunnelState.log("[control-plane] received validated config for profile #" + profileId
                    + " (" + envelope.profileName + " → " + envelope.endpoint + ")");
            if (!envelope.warnings.isEmpty()) {
                TunnelState.log("[control-plane] warnings: " + envelope.warnings);
            }
        } catch (Exception error) {
            TunnelState.log("[control-plane] config fetch failed: " + error.getMessage());
            String cached = ControlPlane.cachedConfig(this);
            if (cached == null || cached.isEmpty()) {
                fail("Could not fetch a configuration and no cached copy exists: " + error.getMessage());
                return;
            }
            envelope = new ControlPlane.Envelope();
            envelope.configJson = cached;
            envelope.profileName = Prefs.profileName(this);
            envelope.mtu = 9000;
            TunnelState.log("[control-plane] falling back to the cached configuration from the last successful fetch");
        }

        TunnelState.setState(TunnelState.CONNECTING, "Establishing the TUN interface…");
        int fd = establishTun(envelope);
        if (fd < 0) {
            return;
        }

        TunnelState.setState(TunnelState.CONNECTING, "Starting the sing-box core…");
        boolean started = TunnelCore.start(this, envelope.configJson, fd);
        if (!started) {
            closeTun();
            fail("The sing-box core refused to start. See the log above for the real error.");
            return;
        }

        running = true;
        TunnelState.markStarted();
        TunnelState.setCoreVersion(TunnelCore.version());
        TunnelState.setState(TunnelState.CONNECTED,
                "Core running with " + envelope.profileName + " · traffic is routed by sing-box inside this VpnService.");
        startReportLoop();
        sampleTraffic();
        updateNotification();
    }

    /** Builds the VpnService TUN using the exact parameters the control plane supplied. */
    private int establishTun(ControlPlane.Envelope envelope) {
        try {
            Builder builder = new Builder()
                    .setSession("Nora Tunnel")
                    .setMtu(envelope.mtu > 0 ? envelope.mtu : 9000)
                    .addAddress(envelope.tunAddress.isEmpty() ? "172.19.0.1" : envelope.tunAddress, 30)
                    .addRoute("0.0.0.0", 0);

            if (!envelope.tunAddress6.isEmpty()) {
                builder.addAddress(envelope.tunAddress6, 126);
                builder.addRoute("::", 0);
            }
            if (!envelope.dns.isEmpty()) {
                for (String server : envelope.dns.split(",")) {
                    String trimmed = server.trim();
                    if (!trimmed.isEmpty()) {
                        builder.addDnsServer(trimmed);
                    }
                }
            }
            for (String excluded : envelope.excludePackages) {
                builder.addDisallowedApplication(excluded);
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                builder.setMetered(false);
                builder.setBlocking(true);
            }
            for (String included : envelope.includePackages) {
                try {
                    builder.addAllowedApplication(included);
                } catch (android.content.pm.PackageManager.NameNotFoundException missing) {
                    TunnelState.log("[vpn] package not installed on this device, skipping: " + included);
                }
            }

            tunDescriptor = builder.establish();
            if (tunDescriptor == null) {
                fail("Android refused to establish the VPN interface (the permission request may have been denied).");
                return -1;
            }
            TunnelState.log("[vpn] TUN established · mtu " + envelope.mtu
                    + " · dns " + (envelope.dns.isEmpty() ? "core default" : envelope.dns)
                    + " · include " + envelope.includePackages.size()
                    + " · exclude " + envelope.excludePackages.size());
            return tunDescriptor.detachFd();
        } catch (Exception error) {
            fail("TUN setup failed: " + error.getMessage());
            return -1;
        }
    }

    /* -------------------------------- stats -------------------------------- */

    private void sampleTraffic() {
        ui.removeCallbacksAndMessages("traffic");
        ui.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (!running) {
                    return;
                }
                long[] totals = TunnelCore.trafficTotals();
                if (totals != null && totals.length >= 4) {
                    TunnelState.setTotals(totals[0], totals[1]);
                    TunnelState.setRates(totals[2], totals[3]);
                }
                String exit = TunnelCore.lastExitAddress();
                if (exit != null && !exit.isEmpty()) {
                    TunnelState.setExitAddress(exit);
                }
                updateNotification();
                ui.postDelayed(this, 1000L);
            }
        }, 1000L);
    }

    private void startReportLoop() {
        if (reportTickRunning) {
            return;
        }
        reportTickRunning = true;
        ui.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (!running) {
                    reportTickRunning = false;
                    return;
                }
                io.execute(() -> pushReport(false));
                ui.postDelayed(this, REPORT_INTERVAL_MS);
            }
        }, REPORT_INTERVAL_MS);
    }

    /** Sends the numbers the core actually produced to the control plane. */
    private void pushReport(boolean finalReport) {
        try {
            JSONObject body = new JSONObject();
            body.put("profileId", Prefs.profileId(this));
            body.put("state", TunnelState.state());
            body.put("coreVersion", TunnelCore.version());
            body.put("rxBytes", TunnelState.rxBytes());
            body.put("txBytes", TunnelState.txBytes());
            body.put("latencyMs", TunnelCore.lastHandshakeMs());
            body.put("exitAddress", TunnelState.exitAddress());
            body.put("sessionStartedAt", TunnelState.connectedAt());
            body.put("final", finalReport);
            body.put("deviceModel", Build.MANUFACTURER + " " + Build.MODEL);
            body.put("androidVersion", Build.VERSION.RELEASE);
            JSONArray logLines = new JSONArray();
            List<String> logs = TunnelState.logsSnapshot();
            int from = Math.max(0, logs.size() - 12);
            for (int index = from; index < logs.size(); index += 1) {
                logLines.put(logs.get(index));
            }
            body.put("logTail", logLines);
            ControlPlane.report(this, body);
            TunnelState.reportResult(true, formatBytes(TunnelState.rxBytes()) + " down / " + formatBytes(TunnelState.txBytes()) + " up");
        } catch (Exception error) {
            TunnelState.reportResult(false, error.getMessage());
        }
    }

    /* ------------------------------- shutdown ------------------------------ */

    private void shutdownCore() {
        running = false;
        reportTickRunning = false;
        ui.removeCallbacksAndMessages("traffic");
        TunnelState.setState(TunnelState.STOPPING, "Stopping the core…");
        try {
            TunnelCore.stop();
        } catch (RuntimeException error) {
            TunnelState.log("[core] stop raised: " + error.getMessage());
        }
        TunnelState.markStopped();
        closeTun();
    }

    private void shutdown() {
        if (running) {
            pushReport(true);
        }
        shutdownCore();
        TunnelState.setState(TunnelState.STOPPED, "Tunnel stopped. Traffic is no longer routed by Nora Tunnel.");
        Prefs.saveState(this, TunnelState.STOPPED);
        stopForegroundCompat();
        stopSelf();
    }

    private void closeTun() {
        if (tunDescriptor != null) {
            try {
                tunDescriptor.close();
            } catch (Exception ignored) {
            }
            tunDescriptor = null;
        }
    }

    private void fail(String detail) {
        running = false;
        TunnelState.setState(TunnelState.ERROR, detail);
        TunnelState.log("[error] " + detail);
        closeTun();
        stopForegroundCompat();
        stopSelf();
    }

    @Override
    public void onRevoke() {
        TunnelState.log("[vpn] Android revoked the VPN permission — tearing down the real session");
        shutdown();
    }

    @Override
    public void onDestroy() {
        if (running) {
            shutdownCore();
        }
        super.onDestroy();
    }

    /* ----------------------------- notification ---------------------------- */

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, getString(R.string.channel_name), NotificationManager.IMPORTANCE_LOW);
        channel.setDescription(getString(R.string.channel_description));
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    private Notification buildNotification() {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent contentIntent = PendingIntent.getActivity(this, 0, open,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);

        Intent stopIntent = new Intent(this, NoraVpnService.class).setAction(ACTION_STOP);
        PendingIntent stopPending = PendingIntent.getService(this, 1, stopIntent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);

        String title = "Nora Tunnel · " + TunnelState.state();
        String text = TunnelState.profileName().isEmpty()
                ? TunnelState.message()
                : String.format(Locale.US, "%s · ↓ %s ↑ %s", TunnelState.profileName(),
                formatBytes(TunnelState.rxBytes()), formatBytes(TunnelState.txBytes()));

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);

        builder.setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text + "\n" + TunnelState.message()))
                .setSmallIcon(R.drawable.ic_tile)
                .setContentIntent(contentIntent)
                .setOngoing(TunnelState.coreRunning())
                .setOnlyAlertOnce(true)
                .addAction(new Notification.Action.Builder(null, "Disconnect", stopPending).build());

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            builder.setVisibility(Notification.VISIBILITY_PRIVATE);
        }
        return builder.build();
    }

    private void updateNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, buildNotification());
        }
    }

    private void stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
    }

    private static String formatBytes(long bytes) {
        if (bytes <= 0) {
            return "0 B";
        }
        String[] units = {"B", "KB", "MB", "GB", "TB"};
        int index = (int) (Math.log10(bytes) / Math.log10(1024));
        index = Math.max(0, Math.min(index, units.length - 1));
        return String.format(Locale.US, "%.2f %s", bytes / Math.pow(1024, index), units[index]);
    }

    @SuppressWarnings("unused")
    private List<String> packagesPlaceholder() {
        return new ArrayList<>();
    }
}
