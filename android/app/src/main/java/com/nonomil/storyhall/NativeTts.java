package com.nonomil.storyhall;

import android.content.Context;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import java.io.File;
import java.io.IOException;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Offline fallback for {@code /api/tts} when a pre-rendered clip is not in the
 * data pack. Android WebView speechSynthesis is often empty on handhelds.
 */
final class NativeTts {
    private static final Object LOCK = new Object();
    private static TextToSpeech engine;
    private static volatile boolean ready;

    private NativeTts() {}

    static void ensure(Context ctx) {
        synchronized (LOCK) {
            if (engine != null) {
                return;
            }
            engine = new TextToSpeech(ctx.getApplicationContext(), status -> {
                ready = status == TextToSpeech.SUCCESS;
            });
        }
    }

    static File synthesize(String text, String voice) {
        waitReady(2000);
        synchronized (LOCK) {
            if (engine == null || !ready || text == null || text.isEmpty()) {
                return null;
            }
            File tmp;
            try {
                tmp = File.createTempFile("bookplay-tts-", ".wav");
            } catch (IOException e) {
                return null;
            }
            tmp.deleteOnExit();
            CountDownLatch latch = new CountDownLatch(1);
            AtomicInteger result = new AtomicInteger(TextToSpeech.ERROR);
            engine.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override
                public void onStart(String utteranceId) {}

                @Override
                public void onDone(String utteranceId) {
                    result.set(TextToSpeech.SUCCESS);
                    latch.countDown();
                }

                @Override
                public void onError(String utteranceId) {
                    latch.countDown();
                }
            });
            Locale locale = "zh".equals(voice) ? Locale.CHINA : Locale.US;
            int lang = engine.setLanguage(locale);
            if (lang == TextToSpeech.LANG_MISSING_DATA || lang == TextToSpeech.LANG_NOT_SUPPORTED) {
                tmp.delete();
                return null;
            }
            int queued = engine.synthesizeToFile(text, new Bundle(), tmp, "bookplay-tts");
            if (queued != TextToSpeech.SUCCESS) {
                tmp.delete();
                return null;
            }
            try {
                if (!latch.await(4, TimeUnit.SECONDS) || result.get() != TextToSpeech.SUCCESS) {
                    tmp.delete();
                    return null;
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                tmp.delete();
                return null;
            }
            if (!tmp.isFile() || tmp.length() == 0) {
                tmp.delete();
                return null;
            }
            return tmp;
        }
    }

    private static void waitReady(long millis) {
        long deadline = System.currentTimeMillis() + millis;
        while (!ready && System.currentTimeMillis() < deadline) {
            try {
                Thread.sleep(50);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }
}
