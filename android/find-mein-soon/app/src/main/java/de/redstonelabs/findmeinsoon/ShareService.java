package de.redstonelabs.findmeinsoon;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import java.util.ArrayList;
import java.util.List;

/**
 * Vordergrund-Dienst: haelt die App am Leben, wenn der Bildschirm aus ist, und fragt den Standort nativ ab.
 * Positionen gehen an die MainActivity, die sie an die Web-App weiterreicht. Laeuft nur, solange eine
 * Gruppe aktiv ist und "Standort teilen" an ist.
 */
public class ShareService extends Service {

    public static final String ACTION_START = "de.redstonelabs.findmeinsoon.START";
    public static final String ACTION_STOP = "de.redstonelabs.findmeinsoon.STOP";
    public static final String CHANNEL_SHARING = "sharing";
    private static final int NOTIFICATION_ID = 1;
    private static final long MIN_TIME_MS = 20000;
    private static final float MIN_DISTANCE_M = 15f;

    /** Empfaenger fuer Positionen (die MainActivity, solange sie lebt). */
    public interface PositionSink {
        void onNativePosition(Location location);
    }

    private static PositionSink sink;
    private static boolean running;

    private LocationManager locationManager;
    private PowerManager.WakeLock wakeLock;
    private final LocationListener listener = new LocationListener() {
        @Override
        public void onLocationChanged(Location location) {
            PositionSink target = sink;
            if (target != null && location != null) target.onNativePosition(location);
        }

        @Override
        public void onProviderEnabled(String provider) {
        }

        @Override
        public void onProviderDisabled(String provider) {
        }

        @Override
        @SuppressWarnings("deprecation")
        public void onStatusChanged(String provider, int status, android.os.Bundle extras) {
        }
    };

    public static void setSink(PositionSink target) {
        sink = target;
    }

    public static boolean isRunning() {
        return running;
    }

    public static void start(Context context) {
        Intent intent = new Intent(context, ShareService.class).setAction(ACTION_START);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent);
        else context.startService(intent);
    }

    public static void stop(Context context) {
        context.startService(new Intent(context, ShareService.class).setAction(ACTION_STOP));
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            PositionSink target = sink;
            if (target instanceof MainActivity) ((MainActivity) target).onSharingStoppedFromNotification();
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!hasLocationPermission()) {
            // Ohne Standort-Berechtigung darf kein Standort-Dienst im Vordergrund laufen (Android 14+).
            stopSelf();
            return START_NOT_STICKY;
        }
        showForeground();
        startLocationUpdates();
        running = true;
        return START_NOT_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // App wurde weggewischt: ohne WebView gibt es nichts mehr zu senden.
        stopSelf();
    }

    @Override
    public void onDestroy() {
        running = false;
        stopLocationUpdates();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    private void showForeground() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_SHARING, getString(R.string.channel_sharing), NotificationManager.IMPORTANCE_LOW);
            channel.setDescription(getString(R.string.channel_sharing_description));
            channel.setShowBadge(false);
            manager.createNotificationChannel(channel);
        }

        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openIntent = PendingIntent.getActivity(this, 1, open, pendingFlags());
        Intent stop = new Intent(this, ShareService.class).setAction(ACTION_STOP);
        PendingIntent stopIntent = PendingIntent.getService(this, 2, stop, pendingFlags());

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_SHARING)
                : legacyBuilder();
        builder.setSmallIcon(R.drawable.ic_stat_pin)
                .setContentTitle(getString(R.string.sharing_title))
                .setContentText(getString(R.string.sharing_text))
                .setContentIntent(openIntent)
                .setOngoing(true)
                .setCategory(Notification.CATEGORY_SERVICE)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .addAction(new Notification.Action.Builder(null, getString(R.string.sharing_stop), stopIntent).build());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        Notification notification = builder.build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        PowerManager power = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (power != null && wakeLock == null) {
            wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "FindMeinSoon:share");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire();
        }
    }

    @SuppressWarnings("deprecation")
    private Notification.Builder legacyBuilder() {
        return new Notification.Builder(this).setPriority(Notification.PRIORITY_LOW);
    }

    private void startLocationUpdates() {
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (locationManager == null) return;
        try {
            for (String provider : providers()) {
                locationManager.requestLocationUpdates(provider, MIN_TIME_MS, MIN_DISTANCE_M, listener);
            }
        } catch (SecurityException error) {
            stopSelf();
        }
    }

    private List<String> providers() {
        List<String> providers = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && locationManager.hasProvider(LocationManager.FUSED_PROVIDER)) {
            providers.add(LocationManager.FUSED_PROVIDER);
            return providers;
        }
        if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) providers.add(LocationManager.GPS_PROVIDER);
        if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) providers.add(LocationManager.NETWORK_PROVIDER);
        return providers;
    }

    private void stopLocationUpdates() {
        if (locationManager != null) {
            try { locationManager.removeUpdates(listener); } catch (SecurityException ignored) {}
        }
        locationManager = null;
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    static int pendingFlags() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                : PendingIntent.FLAG_UPDATE_CURRENT;
    }
}
