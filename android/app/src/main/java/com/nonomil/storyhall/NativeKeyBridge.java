package com.nonomil.storyhall;

import android.os.Build;
import android.os.SystemClock;
import android.util.DisplayMetrics;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.webkit.WebView;

import org.json.JSONException;
import org.json.JSONObject;

final class NativeKeyBridge {
    private float lastLx;
    private float lastLy;
    private float lastRx;
    private float lastRy;
    private long lastAxisAt;

    void injectProfile(WebView webView, DisplayMetrics metrics) {
        if (webView == null || metrics == null) {
            return;
        }
        try {
            JSONObject payload = new JSONObject();
            payload.put("hardware", str(Build.HARDWARE));
            payload.put("board", str(Build.BOARD));
            payload.put("device", str(Build.DEVICE));
            payload.put("model", str(Build.MODEL));
            payload.put("widthPx", metrics.widthPixels);
            payload.put("heightPx", metrics.heightPixels);
            eval(webView, "window.BookPlayDeviceProfile=" + payload
                    + ";window.BookPlayApplyDeviceProfile&&window.BookPlayApplyDeviceProfile(window.BookPlayDeviceProfile)");
        } catch (JSONException ignored) {
        }
    }

    void injectKey(WebView webView, KeyEvent event) {
        if (webView == null || event == null) {
            return;
        }
        try {
            JSONObject payload = new JSONObject();
            payload.put("keyCode", event.getKeyCode());
            payload.put("scanCode", event.getScanCode());
            payload.put("action", event.getAction());
            payload.put("repeat", event.getRepeatCount());
            payload.put("source", event.getSource());
            payload.put("name", KeyEvent.keyCodeToString(event.getKeyCode()));
            eval(webView, "window.BookPlayNativeKey&&window.BookPlayNativeKey(" + payload + ")");
        } catch (JSONException ignored) {
        }
    }

    void injectAxis(WebView webView, MotionEvent event) {
        if (webView == null || event == null) {
            return;
        }
        float lx = event.getAxisValue(MotionEvent.AXIS_X);
        float ly = event.getAxisValue(MotionEvent.AXIS_Y);
        float rx = firstAxis(event, MotionEvent.AXIS_Z, MotionEvent.AXIS_RX);
        float ry = firstAxis(event, MotionEvent.AXIS_RZ, MotionEvent.AXIS_RY);
        long now = SystemClock.uptimeMillis();
        if (now - lastAxisAt < 32
                && near(lx, lastLx) && near(ly, lastLy) && near(rx, lastRx) && near(ry, lastRy)) {
            return;
        }
        lastAxisAt = now;
        lastLx = lx;
        lastLy = ly;
        lastRx = rx;
        lastRy = ry;
        try {
            JSONObject payload = new JSONObject();
            payload.put("lx", lx);
            payload.put("ly", ly);
            payload.put("rx", rx);
            payload.put("ry", ry);
            payload.put("hatX", event.getAxisValue(MotionEvent.AXIS_HAT_X));
            payload.put("hatY", event.getAxisValue(MotionEvent.AXIS_HAT_Y));
            payload.put("source", event.getSource());
            payload.put("deviceId", event.getDeviceId());
            eval(webView, "window.BookPlayNativeAxis&&window.BookPlayNativeAxis(" + payload + ")");
        } catch (JSONException ignored) {
        }
    }

    boolean looksLikeJoystick(MotionEvent event) {
        if (event == null) {
            return false;
        }
        int source = event.getSource();
        return (source & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK
                || (source & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD
                || event.getAction() == MotionEvent.ACTION_MOVE;
    }

    private static float firstAxis(MotionEvent event, int primary, int fallback) {
        float value = event.getAxisValue(primary);
        return Math.abs(value) > 0.01f ? value : event.getAxisValue(fallback);
    }

    private static boolean near(float a, float b) {
        return Math.abs(a - b) < 0.02f;
    }

    private static String str(String value) {
        return value == null ? "" : value;
    }

    private static void eval(WebView webView, String js) {
        webView.evaluateJavascript(js, null);
    }
}
