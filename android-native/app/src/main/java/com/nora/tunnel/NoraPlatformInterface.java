package com.nora.tunnel;

import android.content.Context;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;

import io.nekohasekai.libbox.BridgeOptions;
import io.nekohasekai.libbox.BridgeSession;
import io.nekohasekai.libbox.ConnectionOwner;
import io.nekohasekai.libbox.InterfaceUpdateListener;
import io.nekohasekai.libbox.LocalDNSTransport;
import io.nekohasekai.libbox.NeighborUpdateListener;
import io.nekohasekai.libbox.NetworkInterfaceIterator;
import io.nekohasekai.libbox.Notification;
import io.nekohasekai.libbox.PlatformInterface;
import io.nekohasekai.libbox.PlatformUser;
import io.nekohasekai.libbox.RoutePrefix;
import io.nekohasekai.libbox.RoutePrefixIterator;
import io.nekohasekai.libbox.ShellSession;
import io.nekohasekai.libbox.StringIterator;
import io.nekohasekai.libbox.TunOptions;
import io.nekohasekai.libbox.WIFIState;

/**
 * Android side of the sing-box platform contract.
 *
 * openTun() returns the file descriptor of the TUN interface this app already
 * established through VpnService, and reports the parameters the core asked for so
 * a mismatch between the interface and the core is visible in the log.
 *
 * Everything else is deliberately minimal: features this build does not use
 * (bridges, neighbour discovery, USB-IP, SSH shell) return empty values instead of
 * pretending to be implemented.
 */
public class NoraPlatformInterface implements PlatformInterface {
    private final Context context;
    private final int tunFd;

    public NoraPlatformInterface(Context context, int tunFd) {
        this.context = context.getApplicationContext();
        this.tunFd = tunFd;
    }

    @Override
    public int openTun(TunOptions options) {
        StringBuilder addresses = new StringBuilder();
        RoutePrefixIterator inet4 = options.getInet4Address();
        while (inet4 != null && inet4.hasNext()) {
            RoutePrefix prefix = inet4.next();
            addresses.append(prefix.address()).append('/').append(prefix.prefix()).append(' ');
        }
        TunnelState.log("[core] openTun requested · mtu " + options.getMTU() + " · addresses " + addresses.toString().trim()
                + " · auto_route " + options.getAutoRoute() + " · returning the VpnService fd " + tunFd);
        return tunFd;
    }

    @Override
    public boolean useProcFS() {
        return true;
    }

    @Override
    public boolean usePlatformAutoDetectInterfaceControl() {
        return false;
    }

    @Override
    public void autoDetectInterfaceControl(int fd) {
        // Protected sockets are handled by the core; nothing to bind here.
    }

    @Override
    public LocalDNSTransport localDNSTransport() {
        return null;
    }

    @Override
    public ConnectionOwner findConnectionOwner(int ipProtocol, String sourceAddress, int sourcePort, String destinationAddress, int destinationPort) {
        // Per-connection owner lookup is not implemented in this build; the core then
        // falls back to its own interface detection instead of guessing a package.
        return null;
    }

    @Override
    public void startDefaultInterfaceMonitor(InterfaceUpdateListener listener) {
        // The VpnService re-resolves the default network itself; no monitor registered.
    }

    @Override
    public void closeDefaultInterfaceMonitor(InterfaceUpdateListener listener) {
    }

    @Override
    public NetworkInterfaceIterator getInterfaces() {
        return null;
    }

    @Override
    public boolean underNetworkExtension() {
        return false;
    }

    @Override
    public boolean includeAllNetworks() {
        return true;
    }

    @Override
    public WIFIState readWIFIState() {
        try {
            ConnectivityManager manager = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (manager == null) {
                return null;
            }
            Network active = manager.getActiveNetwork();
            NetworkCapabilities capabilities = manager.getNetworkCapabilities(active);
            if (capabilities != null && capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                LinkProperties properties = manager.getLinkProperties(active);
                String name = properties == null ? "wifi" : properties.getInterfaceName();
                return new WIFIState(name, "");
            }
        } catch (RuntimeException error) {
            TunnelState.log("[core] wifi state read failed: " + error.getMessage());
        }
        return null;
    }

    @Override
    public void clearDNSCache() {
    }

    @Override
    public void sendNotification(Notification notification) {
        if (notification != null && notification.getTitle() != null) {
            TunnelState.log("[core] " + notification.getTitle() + (notification.getBody() == null ? "" : " — " + notification.getBody()));
        }
    }

    @Override
    public void cancelNotification(String identifier, int typeID) {
    }

    @Override
    public void startNeighborMonitor(NeighborUpdateListener listener) {
    }

    @Override
    public void closeNeighborMonitor(NeighborUpdateListener listener) {
    }

    @Override
    public void registerMyInterface(String name) {
    }

    @Override
    public boolean usePlatformShell() {
        return false;
    }

    @Override
    public void checkPlatformShell() {
    }

    @Override
    public ShellSession openShellSession(PlatformUser user, String command, StringIterator environ, String term, int rows, int cols) {
        return null;
    }

    @Override
    public PlatformUser lookupUser(String username) {
        return null;
    }

    @Override
    public String lookupSFTPServer() {
        return null;
    }

    @Override
    public String readSystemSSHHostKey() {
        return null;
    }

    @Override
    public String tailscaleHostname() {
        return "";
    }

    @Override
    public boolean usePlatformBridge() {
        return false;
    }

    @Override
    public BridgeSession createBridge(BridgeOptions options) {
        return null;
    }

    @SuppressWarnings("unused")
    private PackageManager packages() {
        return context.getPackageManager();
    }
}
