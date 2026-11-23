package com.castforge.studio;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.webkit.PermissionRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import java.util.ArrayList;
import java.util.List;

/**
 * MainActivity for CastForge Studio.
 *
 * Crash-safe lifecycle responsibilities:
 *  - Registers StreamEnginePlugin safely inside try-catch.
 *  - Requests runtime CAMERA, RECORD_AUDIO, and POST_NOTIFICATIONS (Android 13+) permissions.
 *  - Overrides WebView onPermissionRequest safely on the UI thread inside try-catch so WebRTC
 *    camera/microphone prompts never throw IllegalStateException or force-close the app.
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "CastForgeMainActivity";
    private static final int STUDIO_PERMISSIONS_REQUEST_CODE = 42001;

    private PermissionRequest pendingWebViewPermissionRequest = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        try {
            registerPlugin(StreamEnginePlugin.class);
        } catch (Throwable t) {
            Log.e(TAG, "Failed to register StreamEnginePlugin safely", t);
        }

        super.onCreate(savedInstanceState);

        try {
            configureSafeWebView();
        } catch (Throwable t) {
            Log.e(TAG, "Failed to configure safe WebView chrome client", t);
        }

        try {
            requestMissingStudioPermissions();
        } catch (Throwable t) {
            Log.e(TAG, "Runtime permission pre-flight request failed", t);
        }
    }

    private void configureSafeWebView() {
        if (this.bridge == null) return;
        WebView webView = this.bridge.getWebView();
        if (webView == null) return;

        try {
            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setMediaPlaybackRequiresUserGesture(false);
        } catch (Throwable t) {
            Log.w(TAG, "Could not apply WebView media settings", t);
        }

        // Attached during onCreate (CREATED state) so BridgeWebChromeClient's ActivityResultLauncher registers safely
        webView.setWebChromeClient(new BridgeWebChromeClient(this.bridge) {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                if (request == null) return;
                runOnUiThread(() -> {
                    try {
                        String[] resources = request.getResources();
                        if (resources == null || resources.length == 0) {
                            request.deny();
                            return;
                        }

                        List<String> missingAndroidPermissions = new ArrayList<>();
                        for (String res : resources) {
                            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res) &&
                                ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA)
                                    != PackageManager.PERMISSION_GRANTED) {
                                missingAndroidPermissions.add(Manifest.permission.CAMERA);
                            }
                            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res) &&
                                ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO)
                                    != PackageManager.PERMISSION_GRANTED) {
                                missingAndroidPermissions.add(Manifest.permission.RECORD_AUDIO);
                            }
                        }

                        if (missingAndroidPermissions.isEmpty()) {
                            request.grant(resources);
                        } else {
                            // Safely deny any superseded pending request before storing the latest one
                            if (pendingWebViewPermissionRequest != null) {
                                try {
                                    pendingWebViewPermissionRequest.deny();
                                } catch (Throwable ignored) {
                                }
                            }
                            pendingWebViewPermissionRequest = request;
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                                ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.POST_NOTIFICATIONS)
                                    != PackageManager.PERMISSION_GRANTED) {
                                missingAndroidPermissions.add(Manifest.permission.POST_NOTIFICATIONS);
                            }
                            ActivityCompat.requestPermissions(
                                MainActivity.this,
                                missingAndroidPermissions.toArray(new String[0]),
                                STUDIO_PERMISSIONS_REQUEST_CODE
                            );
                        }
                    } catch (Throwable t) {
                        Log.e(TAG, "Safe WebView onPermissionRequest caught error", t);
                        try {
                            request.deny();
                        } catch (Throwable ignored) {
                        }
                    }
                });
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                try {
                    if (pendingWebViewPermissionRequest == request) {
                        pendingWebViewPermissionRequest = null;
                    }
                    super.onPermissionRequestCanceled(request);
                } catch (Throwable t) {
                    Log.w(TAG, "onPermissionRequestCanceled error", t);
                }
            }
        });
    }

    public boolean hasCoreRuntimePermissions() {
        boolean cameraOk = ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED;
        boolean audioOk = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            == PackageManager.PERMISSION_GRANTED;
        boolean notifOk = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
        return cameraOk && audioOk && notifOk;
    }

    public void requestMissingStudioPermissions() {
        List<String> needed = new ArrayList<>();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.CAMERA);
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.RECORD_AUDIO);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        if (!needed.isEmpty()) {
            ActivityCompat.requestPermissions(
                this,
                needed.toArray(new String[0]),
                STUDIO_PERMISSIONS_REQUEST_CODE
            );
        }
    }

    @Override
    public void onRequestPermissionsResult(
        int requestCode,
        @NonNull String[] permissions,
        @NonNull int[] grantResults
    ) {
        try {
            super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        } catch (Throwable t) {
            Log.e(TAG, "Error forwarding onRequestPermissionsResult", t);
        }

        if (requestCode == STUDIO_PERMISSIONS_REQUEST_CODE && pendingWebViewPermissionRequest != null) {
            final PermissionRequest req = pendingWebViewPermissionRequest;
            pendingWebViewPermissionRequest = null;
            runOnUiThread(() -> {
                try {
                    boolean allGranted = grantResults.length > 0;
                    for (int result : grantResults) {
                        if (result != PackageManager.PERMISSION_GRANTED) {
                            allGranted = false;
                            break;
                        }
                    }
                    if (allGranted) {
                        req.grant(req.getResources());
                    } else {
                        req.deny();
                    }
                } catch (Throwable t) {
                    Log.w(TAG, "Could not complete pending WebView PermissionRequest", t);
                }
            });
        }
    }
}
