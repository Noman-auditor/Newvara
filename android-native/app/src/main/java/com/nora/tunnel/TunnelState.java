package com.nora.tunnel;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Single source of truth for the UI.
 *
 * Every value here is written by the real data plane: the serve state, counters and
 * logs reported by the sing-box core, or an explicit error raised by this app.
 * Nothing is synthesised — when the core is not running the counters are zero.
 */
public final class TunnelState {
    public static final String IDLE = "idle";
    public static final String PREPARING = "preparing";
    public static final String CONNECTING = "connecting";
    public static final String CONNECTED = "connected";
    public static final String STOPPING = "stopping";
    public static final String STOPPED = "stopped";
    public static final String ERROR = "error";

    private static final Object LOCK = new Object();
    private static final List<String> LOGS = new ArrayList<>();
    private static final CopyOnWriteArrayList<Runnable> LISTENERS = new CopyOnWriteArrayList<>();
    private static final int LOG_LIMIT = 400;

    private static volatile String state = IDLE;
    private static volatile String message = "Not connected. Nothing is being routed.";
    private static volatile boolean coreRunning;
    private static volatile long rxBytes;
    private static volatile long txBytes;
    private static volatile long connectedAt;
    private static volatile long uplinkBps;
    private static volatile long downlinkBps;
    private static volatile String coreVersion = "";
    private static volatile int profileId;
    private static volatile String profileName;
    private static volatile String exitAddress = "";
    private static volatile long lastReportAt;
    private static volatile String lastReportResult = "";

    private TunnelState() {}

    public static void addListener(Runnable listener) {
        LISTENERS.addIfAbsent(listener);
    }

    public static void removeListener(Runnable listener) {
        LISTENERS.remove(listener);
    }

    private static void notifyListeners() {
        for (Runnable listener : LISTENERS) {
            try {
                listener.run();
            } catch (RuntimeException ignored) {
            }
        }
    }

    public static void setState(String next, String detail) {
        state = next;
        message = detail;
        notifyListeners();
    }

    public static String state() { return state; }
    public static String message() { return message; }
    public static boolean coreRunning() { return coreRunning; }
    public static long rxBytes() { return rxBytes; }
    public static long txBytes() { return txBytes; }
    public static long uplinkBps() { return uplinkBps; }
    public static long downlinkBps() { return downlinkBps; }
    public static long connectedAt() { return connectedAt; }
    public static String coreVersion() { return coreVersion; }
    public static int profileId() { return profileId; }
    public static String profileName() { return profileName; }
    public static String exitAddress() { return exitAddress; }
    public static long lastReportAt() { return lastReportAt; }
    public static String lastReportResult() { return lastReportResult; }

    public static void setCoreVersion(String version) { coreVersion = version; }

    public static void setProfile(int id, String name) {
        profileId = id;
        profileName = name;
        notifyListeners();
    }

    public static void markStarted() {
        coreRunning = true;
        connectedAt = System.currentTimeMillis();
        notifyListeners();
    }

    public static void markStopped() {
        coreRunning = false;
        connectedAt = 0;
        uplinkBps = 0;
        downlinkBps = 0;
        notifyListeners();
    }

    public static void resetCounters() {
        rxBytes = 0;
        txBytes = 0;
        uplinkBps = 0;
        downlinkBps = 0;
        connectedAt = 0;
        notifyListeners();
    }

    /** Counters come straight from the core's traffic totals. */
    public static void setTotals(long downlink, long uplink) {
        rxBytes = downlink;
        txBytes = uplink;
    }

    public static void setRates(long downlinkBpsValue, long uplinkBpsValue) {
        downlinkBps = downlinkBpsValue;
        uplinkBps = uplinkBpsValue;
        notifyListeners();
    }

    public static void setExitAddress(String address) {
        exitAddress = address == null ? "" : address;
        notifyListeners();
    }

    public static void reportResult(boolean ok, String detail) {
        lastReportAt = System.currentTimeMillis();
        lastReportResult = (ok ? "ok · " : "failed · ") + (detail == null ? "" : detail);
        notifyListeners();
    }

    public static void log(String line) {
        synchronized (LOCK) {
            LOGS.add(line);
            while (LOGS.size() > LOG_LIMIT) {
                LOGS.remove(0);
            }
        }
        notifyListeners();
    }

    public static List<String> logsSnapshot() {
        synchronized (LOCK) {
            return new ArrayList<>(LOGS);
        }
    }

    public static String logsText() {
        StringBuilder builder = new StringBuilder();
        for (String line : logsSnapshot()) {
            builder.append(line).append('\n');
        }
        return builder.toString();
    }

    public static void clearLogs() {
        synchronized (LOCK) {
            LOGS.clear();
        }
        notifyListeners();
    }
}
