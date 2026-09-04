package com.nonomil.storyhall;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.AssetManager;
import android.net.Uri;

import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.util.zip.ZipEntry;

final class DataPackStore {
    private static final String PREF = "storyhall";
    private static final String KEY = "data_tree";
    private static final String KIND = "data_kind";

    private DataPackStore() {}

    static void saveTree(Context ctx, Uri uri) {
        save(ctx, uri, "tree");
    }

    static void saveZip(Context ctx, Uri uri) {
        save(ctx, uri, "zip");
    }

    private static void save(Context ctx, Uri uri, String kind) {
        if (uri == null) return;
        ZipPack.closeCached();
        ContentResolver cr = ctx.getContentResolver();
        cr.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY, uri.toString())
            .putString(KIND, kind)
            .apply();
    }

    static Uri storedUri(Context ctx) {
        String raw = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).getString(KEY, "");
        if (raw == null || raw.isEmpty()) return null;
        return Uri.parse(raw);
    }

    static String kind(Context ctx) {
        return ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).getString(KIND, "tree");
    }

    static boolean isReady(Context ctx) {
        return hasEmbedded(ctx, "dialogue_stories/ep1.json")
            || openStream(ctx, "dialogue_stories/ep1.json") != null
            || openStream(ctx, "dialogue_stories/index.json") != null;
    }

    static JSObject status(Context ctx) {
        JSObject o = new JSObject();
        boolean ready = isReady(ctx);
        o.put("ready", ready);
        Uri uri = storedUri(ctx);
        o.put("uri", uri == null ? "" : uri.toString());
        o.put("kind", kind(ctx));
        o.put("builtin", hasEmbedded(ctx, "content-manifest.json"));
        o.put("message", ready
            ? (hasEmbedded(ctx, "content-manifest.json")
                ? "首发体验已就绪；更多内容可导入数据包"
                : "数据包已就绪")
            : "请选择 content 文件夹，或选择 故事馆数据包.zip");
        return o;
    }

    static InputStream openStream(Context ctx, String rel) {
        try {
            Source src = resolve(ctx, rel);
            return src == null ? null : src.open();
        } catch (Exception e) {
            return null;
        }
    }

    static Source resolve(Context ctx, String rel) throws FileNotFoundException {
        String clean = rel == null ? "" : rel.replace('\\', '/').replaceFirst("^/+", "");
        File fileRoot = fileRoot();
        if (fileRoot != null) {
            File f = new File(fileRoot, clean);
            if (f.isFile()) return Source.fromFile(f);
        }
        Uri uri = storedUri(ctx);
        if (uri != null && "zip".equals(kind(ctx))) {
            ZipPack pack = ZipPack.open(ctx, uri);
            if (pack != null) {
                ZipEntry entry = pack.entry(clean);
                if (entry != null && !entry.isDirectory()) return Source.fromZip(pack, entry);
            }
        } else if (uri != null) {
            DocumentFile doc = walk(DocumentFile.fromTreeUri(ctx, uri), clean);
            if (doc != null && doc.exists() && doc.isFile()) {
                return Source.fromDoc(ctx.getContentResolver(), doc.getUri());
            }
        }
        // A starter APK remains usable after an optional external pack is
        // selected.  Missing external entries fall back to the embedded
        // starter tree; imported entries naturally take precedence above.
        return embedded(ctx, clean);
    }

    private static boolean hasEmbedded(Context ctx, String rel) {
        try (InputStream ignored = ctx.getAssets().open("data/" + rel.replace('\\', '/').replaceFirst("^/+", ""))) {
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private static Source embedded(Context ctx, String rel) {
        String clean = rel == null ? "" : rel.replace('\\', '/').replaceFirst("^/+", "");
        if (clean.isEmpty()) return null;
        try (InputStream ignored = ctx.getAssets().open("data/" + clean)) {
            return Source.fromAsset(ctx.getAssets(), "data/" + clean);
        } catch (Exception e) {
            return null;
        }
    }

    static File fileRoot() {
        String[] cands = {
            "/storage/emulated/0/故事馆",
            "/storage/emulated/0/Download/故事馆",
            "/storage/emulated/0/Download/content",
            "/storage/emulated/0/BookPlay"
        };
        for (String p : cands) {
            File stories = new File(p, "dialogue_stories");
            if (stories.isDirectory()) return new File(p);
        }
        return null;
    }

    private static DocumentFile walk(DocumentFile root, String rel) {
        if (root == null) return null;
        if (rel == null || rel.isEmpty()) return root;
        DocumentFile cur = root;
        for (String part : rel.split("/")) {
            if (part.isEmpty()) continue;
            cur = cur.findFile(part);
            if (cur == null) return null;
        }
        return cur;
    }

    static final class Source {
        final ContentResolver resolver;
        final Uri uri;
        final File file;
        final ZipPack zip;
        final ZipEntry zipEntry;
        final AssetManager assets;
        final String assetPath;

        private Source(ContentResolver resolver, Uri uri, File file, ZipPack zip, ZipEntry zipEntry,
                       AssetManager assets, String assetPath) {
            this.resolver = resolver;
            this.uri = uri;
            this.file = file;
            this.zip = zip;
            this.zipEntry = zipEntry;
            this.assets = assets;
            this.assetPath = assetPath;
        }

        static Source fromFile(File file) {
            return new Source(null, null, file, null, null, null, null);
        }

        static Source fromDoc(ContentResolver resolver, Uri uri) {
            return new Source(resolver, uri, null, null, null, null, null);
        }

        static Source fromZip(ZipPack zip, ZipEntry entry) {
            return new Source(null, null, null, zip, entry, null, null);
        }

        static Source fromAsset(AssetManager assets, String assetPath) {
            return new Source(null, null, null, null, null, assets, assetPath);
        }

        long size() {
            if (file != null) return file.length();
            if (zipEntry != null) return zipEntry.getSize();
            if (assets != null) {
                try (android.content.res.AssetFileDescriptor afd = assets.openFd(assetPath)) {
                    return afd.getLength();
                } catch (Exception ignored) {
                    try (InputStream in = assets.open(assetPath, AssetManager.ACCESS_STREAMING)) {
                        return in.available();
                    } catch (Exception ignoredAgain) {
                        return -1;
                    }
                }
            }
            try (android.content.res.AssetFileDescriptor afd = resolver.openAssetFileDescriptor(uri, "r")) {
                return afd == null ? -1 : afd.getLength();
            } catch (Exception e) {
                return -1;
            }
        }

        InputStream open() throws FileNotFoundException {
            if (file != null) return new FileInputStream(file);
            if (zip != null && zipEntry != null) {
                try {
                    return zip.open(zipEntry);
                } catch (Exception e) {
                    throw new FileNotFoundException(zipEntry.getName());
                }
            }
            if (assets != null) {
                try {
                    return assets.open(assetPath, AssetManager.ACCESS_STREAMING);
                } catch (IOException e) {
                    throw new FileNotFoundException(assetPath);
                }
            }
            return resolver.openInputStream(uri);
        }
    }
}
