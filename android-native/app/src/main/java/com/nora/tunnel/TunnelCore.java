package com.nora.tunnel;

import android.content.Context;

import io.nekohasekai.libbox.CommandClient;
import io.nekohasekai.libbox.CommandClientOptions;
import io.nekohasekai.libbox.CommandServer;
import io.nekohasekai.libbox.Libbox;
import io.nekohasekai.libbox.SetupOptions;

/**
 * Bridge to the bundled sing-box core.
 *
 * The core is the real upstream implementation, compiled from SagerNet/sing-box
 * source with gomobile (arm64-v8a). This class only:
 *   1. points it at private directories,
 *   2. hands it the configuration that the control plane validated,
 *   3. asks it for its own traffic totals and logs.
 *
 * There is no cryptography in this project and no fabricated state: if the core is
 * missing or refuses the config, start() returns false and the UI says so.
 */
public final class TunnelCore {
    private static final int COMMAND_PORT = 31080;
    private static final String COMMAND_SECRET = "";

    private static CommandServer server;
    private static CommandClient client;

    private static volatile boolean running;
    private static volatile boolean trafficAvailable;
    private static volatile long downTotal;
    private static volatile long upTotal;
    private static volatile long downRate;
    private static volatile long upRate;
    private static volatile long previousDown;
    private static volatile long previousUp;
    private static volatile long previousSampleAt;
    private static volatile int connectionsIn;
    private static volatile int connectionsOut;
    private static volatile long handshakeMs;
    private static volatile String exitAddress = "";

    private TunnelCore() {}

    public static String version() {
        try {
            return Libbox.version();
        } catch (Throwable error) {
            return "";
        }
    }

    public static String goVersion() {
        try {
            return Libbox.goVersion();
        } catch (Throwable error) {
            return "";
        }
    }

    public static boolean isRunning() {
        return running;
    }

    public static long lastHandshakeMs() {
        return handshakeMs;
    }

    public static String lastExitAddress() {
        return exitAddress;
    }

    public static void acceptStatus(long downlinkTotal, long uplinkTotal, boolean available, int in, int out) {
        long now = System.currentTimeMillis();
        if (previousSampleAt != 0) {
            double seconds = Math.max(0.2d, (now - previousSampleAt) / 1000.0d);
            downRate = (long) Math.max(0, (downlinkTotal - previousDown) / seconds);
            upRate = (long) Math.max(0, (uplinkTotal - previousUp) / seconds);
        }
        previousDown = downlinkTotal;
        previousUp = uplinkTotal;
        previousSampleAt = now;
        downTotal = downlinkTotal;
        upTotal = uplinkTotal;
        trafficAvailable = available;
        connectionsIn = in;
        connectionsOut = out;
        TunnelState.setTotals(downTotal, upTotal);
        TunnelState.setRates(downRate, upRate);
    }

    /** Real totals: {downlinkBytes, uplinkBytes, downlinkBps, uplinkBps}. */
    public static long[] trafficTotals() {
        return new long[]{downTotal, upTotal, downRate, upRate};
    }

    public static boolean trafficAvailable() {
        return trafficAvailable;
    }

    public static int[] connectionCounts() {
        return new int[]{connectionsIn, connectionsOut};
    }

    public static boolean start(Context context, String configContent, int tunFd) {
        if (running) {
            TunnelState.log("[core] already running");
            return true;
        }
        try {
            String base = context.getFilesDir().getAbsolutePath() + "/nora";
            SetupOptions options = new SetupOptions();
            options.setBasePath(base);
            options.setWorkingPath(base + "/working");
            options.setTempPath(context.getCacheDir().getAbsolutePath() + "/nora");
            options.setFixAndroidStack(true);
            options.setCommandServerListenPort(COMMAND_PORT);
            options.setCommandServerSecret(COMMAND_SECRET);
            options.setLogMaxLines(600);
            options.setDebug(false);
            options.setCrashReportSource("nora-android");
            options.setAppVersion("1.0.0");
            options.setAppMarketingVersion("Nora Tunnel");
            options.setOomKillerEnabled(false);
            options.setOomKillerDisabled(true);
            options.setOomMemoryLimit(0);
            options.setPowerReportEnabled(false);
            Libbox.setup(options);
            TunnelState.log("[core] sing-box " + Libbox.version() + " · go " + Libbox.goVersion() + " initialised");

            // Real core-side validation of the document before anything starts.
            Libbox.checkConfig(configContent);
            boolean hasTun = Libbox.hasTunInbound(configContent);
            TunnelState.log("[core] configuration accepted by the core (tun inbound: " + hasTun + ")");

            long started = System.currentTimeMillis();
            server = Libbox.newCommandServer(new NoraHandlers.ServerHandler(), new NoraPlatformInterface(context, tunFd));
            server.start();
            server.startOrReloadService(configContent, null);
            handshakeMs = System.currentTimeMillis() - started;
            TunnelState.log("[core] service started (config applied in " + handshakeMs + " ms)");

            CommandClientOptions clientOptions = new CommandClientOptions();
            clientOptions.addCommand(Libbox.CommandStatus);
            clientOptions.addCommand(Libbox.CommandLog);
            clientOptions.setStatusInterval(1000L);
            client = Libbox.newCommandClient(new NoraHandlers.ClientHandler(), clientOptions);
            client.connect();
            TunnelState.log("[core] status channel open — traffic counters now come from the core");

            running = true;
            previousSampleAt = 0;
            previousDown = 0;
            previousUp = 0;
            downTotal = 0;
            upTotal = 0;
            return true;
        } catch (Throwable error) {
            TunnelState.log("[core] start failed: " + error.getClass().getSimpleName() + ": " + error.getMessage());
            stopQuietly();
            return false;
        }
    }

    public static void stop() {
        running = false;
        try {
            if (client != null) {
                client.disconnect();
            }
        } catch (Throwable error) {
            TunnelState.log("[core] status channel close raised: " + error.getMessage());
        }
        client = null;
        stopQuietly();
        downRate = 0;
        upRate = 0;
        previousSampleAt = 0;
    }

    private static void stopQuietly() {
        try {
            if (server != null) {
                server.closeService();
            }
        } catch (Throwable error) {
            TunnelState.log("[core] closeService raised: " + error.getMessage());
        }
        try {
            if (server != null) {
                server.close();
            }
        } catch (Throwable error) {
            TunnelState.log("[core] close raised: " + error.getMessage());
        }
        server = null;
    }

    /** Applies a new configuration to the running core (same as the app's reload). */
    public static boolean reload(String configContent) {
        if (server == null) {
            return false;
        }
        try {
            Libbox.checkConfig(configContent);
            server.startOrReloadService(configContent, null);
            TunnelState.log("[core] configuration reloaded");
            return true;
        } catch (Throwable error) {
            TunnelState.log("[core] reload rejected: " + error.getMessage());
            return false;
        }
    }

    public static void setExitAddress(String address) {
        exitAddress = address == null ? "" : address;
    }
}
