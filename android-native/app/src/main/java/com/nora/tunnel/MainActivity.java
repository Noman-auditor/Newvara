package com.nora.tunnel;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.telephony.TelephonyManager;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The whole UI. Every number shown is either read from the running core or reported
 * by the control plane; the state line never claims "connected" unless the core
 * really started and the TUN interface really exists.
 */
public class MainActivity extends Activity {
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final List<ControlPlane.Profile> profiles = new ArrayList<>();

    private TextView stateText;
    private TextView detailText;
    private TextView countersText;
    private TextView coreText;
    private TextView reportText;
    private TextView logText;
    private EditText urlInput;
    private EditText tokenInput;
    private Spinner profileSpinner;
    private CheckBox autoConnectBox;
    private CheckBox bootBox;
    private Button connectButton;
    private Button refreshButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        stateText = findViewById(R.id.state_text);
        detailText = findViewById(R.id.detail_text);
        countersText = findViewById(R.id.counters_text);
        coreText = findViewById(R.id.core_text);
        reportText = findViewById(R.id.report_text);
        logText = findViewById(R.id.log_text);
        urlInput = findViewById(R.id.url_input);
        tokenInput = findViewById(R.id.token_input);
        profileSpinner = findViewById(R.id.profile_spinner);
        autoConnectBox = findViewById(R.id.auto_connect);
        bootBox = findViewById(R.id.boot_start);
        connectButton = findViewById(R.id.connect_button);
        refreshButton = findViewById(R.id.refresh_button);

        urlInput.setText(Prefs.url(this));
        tokenInput.setText(Prefs.token(this));
        autoConnectBox.setChecked(Prefs.autoConnect(this));
        bootBox.setChecked(Prefs.bootStart(this));

        findViewById(R.id.save_button).setOnClickListener(view -> {
            saveConfig();
            TunnelState.log("[ui] settings saved for " + urlInput.getText().toString().trim());
        });

        refreshButton.setOnClickListener(view -> {
            saveConfig();
            fetchProfiles();
        });

        connectButton.setOnClickListener(view -> {
            saveConfig();
            if (NoraVpnService.isRunning()) {
                NoraVpnService.stop(this);
            } else {
                NoraVpnService.start(this);
            }
        });

        findViewById(R.id.clear_logs).setOnClickListener(view -> TunnelState.clearLogs());

        findViewById(R.id.health_button).setOnClickListener(view -> {
            saveConfig();
            io.execute(() -> {
                try {
                    String payload = ControlPlane.health(getApplicationContext());
                    TunnelState.log("[control-plane] health: " + payload.trim());
                } catch (Exception error) {
                    TunnelState.log("[control-plane] health failed: " + error.getMessage());
                }
            });
        });

        requestNotificationPermission();

        TunnelState.addListener(this::render);
        render();

        if (Prefs.autoConnect(this) && !NoraVpnService.isRunning() && Prefs.profileId(this) != 0) {
            TunnelState.log("[ui] auto-connect enabled — starting selected profile");
            NoraVpnService.start(this);
        }
        if (!Prefs.url(this).isEmpty() && profiles.isEmpty()) {
            fetchProfiles();
        }
    }

    @Override
    protected void onDestroy() {
        TunnelState.removeListener(this::render);
        super.onDestroy();
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1001);
        }
    }

    private void saveConfig() {
        int index = profileSpinner.getSelectedItemPosition();
        int profileId = 0;
        String profileName = "";
        if (index >= 0 && index < profiles.size()) {
            profileId = profiles.get(index).id;
            profileName = profiles.get(index).name;
        } else {
            profileId = Prefs.profileId(this);
            profileName = Prefs.profileName(this);
        }
        Prefs.save(this, urlInput.getText().toString(), tokenInput.getText().toString(), profileId, profileName,
                autoConnectBox.isChecked(), bootBox.isChecked());
        TunnelState.setProfile(profileId, profileName);
    }

    private void fetchProfiles() {
        String url = Prefs.url(this);
        if (url.isEmpty()) {
            TunnelState.log("[ui] set the control-plane URL first");
            return;
        }
        refreshButton.setEnabled(false);
        TunnelState.log("[ui] fetching profile inventory from " + url);
        io.execute(() -> {
            try {
                List<ControlPlane.Profile> fetched = ControlPlane.profiles(getApplicationContext());
                ui.post(() -> {
                    profiles.clear();
                    profiles.addAll(fetched);
                    List<String> labels = new ArrayList<>();
                    for (ControlPlane.Profile profile : fetched) {
                        labels.add(profile.name + "  ·  " + profile.protocol + " " + profile.core + "/" + profile.transport
                                + "  ·  " + profile.server + ":" + profile.port
                                + "  ·  " + profile.validationStatus + " " + profile.validationScore);
                    }
                    if (labels.isEmpty()) {
                        labels.add("no profiles returned by the control plane");
                    }
                    ArrayAdapter<String> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_item, labels);
                    adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
                    profileSpinner.setAdapter(adapter);
                    int selected = Prefs.profileId(this);
                    for (int index = 0; index < fetched.size(); index += 1) {
                        if (fetched.get(index).id == selected) {
                            profileSpinner.setSelection(index);
                        }
                    }
                    saveConfig();
                    TunnelState.log("[ui] " + fetched.size() + " profile(s) available");
                });
            } catch (Exception error) {
                TunnelState.log("[ui] profile fetch failed: " + error.getMessage());
            } finally {
                ui.post(() -> refreshButton.setEnabled(true));
            }
        });
    }

    private void render() {
        String state = TunnelState.state();
        stateText.setText(state.toUpperCase(Locale.US));
        int color;
        switch (state) {
            case TunnelState.CONNECTED:
                color = 0xFF45F0B0;
                break;
            case TunnelState.CONNECTING:
            case TunnelState.PREPARING:
                color = 0xFFFFC857;
                break;
            case TunnelState.ERROR:
                color = 0xFFFF6B8B;
                break;
            default:
                color = 0xFF9AA3C7;
        }
        stateText.setTextColor(color);
        detailText.setText(TunnelState.message());

        long uptime = TunnelState.connectedAt() == 0 ? 0 : (System.currentTimeMillis() - TunnelState.connectedAt()) / 1000L;
        countersText.setText(String.format(Locale.US,
                "down %s   up %s%nuptime %02d:%02d:%02d%nlive  %s down / %s up",
                formatBytes(TunnelState.rxBytes()), formatBytes(TunnelState.txBytes()),
                uptime / 3600, (uptime % 3600) / 60, uptime % 60,
                formatRate(TunnelState.downlinkBps()), formatRate(TunnelState.uplinkBps())));

        String version = TunnelState.coreVersion();
        coreText.setText("core: " + (version.isEmpty() ? "not loaded" : "sing-box " + version)
                + "   ·   profile: " + (TunnelState.profileName().isEmpty() ? "none" : TunnelState.profileName())
                + "   ·   exit " + (TunnelState.exitAddress().isEmpty() ? "unknown" : TunnelState.exitAddress()));

        reportText.setText(TunnelState.lastReportResult().isEmpty()
                ? "control-plane reporting: idle"
                : "control-plane reporting: " + TunnelState.lastReportResult());

        connectButton.setText(NoraVpnService.isRunning() ? "Disconnect" : "Connect");
        connectButton.setTextColor(NoraVpnService.isRunning() ? 0xFFFFD7E0 : 0xFF05060F);
        connectButton.setBackgroundColor(NoraVpnService.isRunning() ? 0x33FF6B8B : 0xFF8B5CF6);

        String logs = TunnelState.logsText();
        logText.setText(logs.isEmpty() ? "core logs appear here as the tunnel runs" : logs);
    }

    private static String formatBytes(long bytes) {
        if (bytes <= 0) {
            return "0 B";
        }
        String[] units = {"B", "KB", "MB", "GB", "TB"};
        int index = (int) (Math.log10(bytes) / Math.log10(1024));
        index = Math.min(index, units.length - 1);
        return String.format(Locale.US, "%.2f %s", bytes / Math.pow(1024, index), units[index]);
    }

    private static String formatRate(long bps) {
        return formatBytes(bps) + "/s";
    }

    /** Convenience for the notification: carrier name so the state is unambiguous. */
    public static String networkName(Activity activity) {
        try {
            TelephonyManager manager = (TelephonyManager) activity.getSystemService(TELEPHONY_SERVICE);
            String name = manager == null ? null : manager.getNetworkOperatorName();
            return name == null || name.isEmpty() ? "unknown network" : name;
        } catch (RuntimeException error) {
            return "unknown network";
        }
    }

    @SuppressWarnings("unused")
    private void openDocumentation(View view) {
        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://github.com/SagerNet/sing-box")));
    }
}
