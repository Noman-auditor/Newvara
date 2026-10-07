package com.nora.tunnel;

import io.nekohasekai.libbox.CommandClientHandler;
import io.nekohasekai.libbox.CommandServerHandler;
import io.nekohasekai.libbox.ConnectionEvents;
import io.nekohasekai.libbox.LogEntry;
import io.nekohasekai.libbox.LogIterator;
import io.nekohasekai.libbox.OutboundGroupItemIterator;
import io.nekohasekai.libbox.OutboundGroupIterator;
import io.nekohasekai.libbox.StatusMessage;
import io.nekohasekai.libbox.StringIterator;
import io.nekohasekai.libbox.SystemProxyStatus;

/** Handlers that surface what the core really reports: lifecycle, logs and traffic. */
public final class NoraHandlers {

    /** Server-side handler: the core asks us to stop, reload or report a crash. */
    public static class ServerHandler implements CommandServerHandler {
        @Override
        public void serviceStop() {
            TunnelState.log("[core] service stop requested by the core");
        }

        @Override
        public void serviceReload() {
            TunnelState.log("[core] service reload requested by the core");
        }

        @Override
        public SystemProxyStatus getSystemProxyStatus() {
            return null;
        }

        @Override
        public void setSystemProxyEnabled(boolean enabled) {
            TunnelState.log("[core] system proxy request ignored: Android has no per-app system proxy");
        }

        @Override
        public void triggerNativeCrash() {
            throw new UnsupportedOperationException("native crash trigger disabled");
        }

        @Override
        public void writeDebugMessage(String message) {
            TunnelState.log("[core] " + message);
        }

        @Override
        public int connectSSHAgent() {
            return -1;
        }
    }

    /** Client-side handler: real logs and real traffic totals from the running core. */
    public static class ClientHandler implements CommandClientHandler {
        @Override
        public void writeStatus(StatusMessage message) {
            if (message == null) {
                return;
            }
            TunnelCore.acceptStatus(
                    message.getDownlinkTotal(),
                    message.getUplinkTotal(),
                    message.getTrafficAvailable(),
                    message.getConnectionsIn(),
                    message.getConnectionsOut());
        }

        @Override
        public void writeLogs(LogIterator messageList) {
            if (messageList == null) {
                return;
            }
            StringBuilder builder = new StringBuilder();
            while (messageList.hasNext()) {
                LogEntry entry = messageList.next();
                if (entry == null) {
                    continue;
                }
                builder.setLength(0);
                builder.append("[core] ");
                switch (entry.getLevel()) {
                    case 0:
                        builder.append("ERROR ");
                        break;
                    case 1:
                        builder.append("WARN ");
                        break;
                    case 2:
                        builder.append("INFO ");
                        break;
                    default:
                        builder.append("DEBUG ");
                        break;
                }
                builder.append(entry.getMessage());
                TunnelState.log(builder.toString());
            }
        }

        @Override
        public void writeConnectionEvents(ConnectionEvents events) {
            // Per-connection events are not streamed to the UI in this build.
        }

        @Override
        public void connected() {
            TunnelState.log("[core] status channel connected");
        }

        @Override
        public void disconnected(String message) {
            TunnelState.log("[core] status channel closed" + (message == null || message.isEmpty() ? "" : ": " + message));
        }

        @Override
        public void initializeClashMode(StringIterator modeList, String currentMode) {
        }

        @Override
        public void updateClashMode(String newMode) {
            TunnelState.log("[core] clash mode → " + newMode);
        }

        @Override
        public void clearLogs() {
        }

        @Override
        public void setDefaultLogLevel(int level) {
        }

        @Override
        public void writeGroups(OutboundGroupIterator message) {
        }

        @Override
        public void writeOutbounds(OutboundGroupItemIterator message) {
        }
    }

    private NoraHandlers() {}
}
