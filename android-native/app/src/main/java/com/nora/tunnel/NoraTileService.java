package com.nora.tunnel;

import android.content.Intent;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;


/** Quick Settings tile that reflects the real tunnel state. */
@SuppressWarnings("deprecation")
public class NoraTileService extends TileService {
    @Override
    public void onStartListening() {
        super.onStartListening();
        render();
    }

    @Override
    public void onClick() {
        super.onClick();
        boolean running = NoraVpnService.isRunning();
        if (running) {
            NoraVpnService.stop(getApplicationContext());
        } else if (Prefs.profileId(getApplicationContext()) != 0) {
            NoraVpnService.start(getApplicationContext());
        } else {
            Intent launch = new Intent(this, MainActivity.class);
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivityAndCollapse(launch);
        }
        render();
    }

    private void render() {
        Tile tile = getQsTile();
        if (tile == null) {
            return;
        }
        String state = TunnelState.state();
        boolean active = NoraVpnService.isRunning();
        tile.setState(active ? Tile.STATE_ACTIVE : Tile.STATE_INACTIVE);
        tile.setLabel("Nora Tunnel · " + state);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            tile.setSubtitle(TunnelState.profileName().isEmpty() ? "no profile" : TunnelState.profileName());
        }
        tile.setIcon(Icon.createWithResource(this, R.drawable.ic_tile));
        tile.updateTile();
    }
}
