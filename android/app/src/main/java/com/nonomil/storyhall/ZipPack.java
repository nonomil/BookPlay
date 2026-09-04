package com.nonomil.storyhall;

import android.content.Context;
import android.net.Uri;
import android.os.ParcelFileDescriptor;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.util.Enumeration;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

final class ZipPack {
    private static ZipPack cached;

    private final String uri;
    private final ParcelFileDescriptor pfd;
    private final ZipFile zip;
    private final String prefix;

    private ZipPack(String uri, ParcelFileDescriptor pfd, ZipFile zip, String prefix) {
        this.uri = uri;
        this.pfd = pfd;
        this.zip = zip;
        this.prefix = prefix;
    }

    static synchronized ZipPack open(Context ctx, Uri uri) {
        if (uri == null) return null;
        if (cached != null && cached.uri.equals(uri.toString())) return cached;
        closeCached();
        ParcelFileDescriptor pfd = null;
        try {
            pfd = ctx.getContentResolver().openFileDescriptor(uri, "r");
            if (pfd == null) return null;
            ZipFile zf = new ZipFile(new File("/proc/self/fd/" + pfd.getFd()));
            cached = new ZipPack(uri.toString(), pfd, zf, detectPrefix(zf));
            return cached;
        } catch (Exception e) {
            if (pfd != null) {
                try {
                    pfd.close();
                } catch (IOException ignored) {
                }
            }
            return null;
        }
    }

    static synchronized void closeCached() {
        if (cached == null) return;
        try {
            cached.zip.close();
        } catch (Exception ignored) {
        }
        try {
            cached.pfd.close();
        } catch (Exception ignored) {
        }
        cached = null;
    }

    ZipEntry entry(String rel) {
        if (rel == null) return null;
        String name = prefix + rel.replace('\\', '/').replaceFirst("^/+", "");
        ZipEntry found = zip.getEntry(name);
        if (found == null && name.endsWith("/")) found = zip.getEntry(name.substring(0, name.length() - 1));
        return found;
    }

    InputStream open(ZipEntry entry) throws IOException {
        return zip.getInputStream(entry);
    }

    private static String detectPrefix(ZipFile zf) {
        Enumeration<? extends ZipEntry> it = zf.entries();
        while (it.hasMoreElements()) {
            String name = it.nextElement().getName().replace('\\', '/');
            int i = name.indexOf("dialogue_stories/");
            if (i >= 0) return name.substring(0, i);
        }
        return "";
    }
}
