package com.nonomil.storyhall;

import android.content.Context;
import android.content.res.AssetManager;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;

final class LocalRangeServer {
    static final int PORT = 18787;
    private static ServerSocket server;

    private LocalRangeServer() {}

    static synchronized void ensure(Context ctx) {
        if (server != null && !server.isClosed()) return;
        try {
            ServerSocket ss = new ServerSocket();
            ss.setReuseAddress(true);
            ss.bind(new InetSocketAddress("127.0.0.1", PORT));
            server = ss;
        } catch (IOException e) {
            return;
        }
        Context app = ctx.getApplicationContext();
        Thread t = new Thread(() -> loop(app), "storyhall-http");
        t.setDaemon(true);
        t.start();
    }

    private static void loop(Context ctx) {
        while (server != null && !server.isClosed()) {
            try {
                Socket sock = server.accept();
                new Thread(() -> handle(ctx, sock), "storyhall-req").start();
            } catch (IOException e) {
                return;
            }
        }
    }

    private static void handle(Context ctx, Socket sock) {
        try (Socket s = sock) {
            s.setSoTimeout(20000);
            InputStream raw = new BufferedInputStream(s.getInputStream());
            String head = readHead(raw);
            if (head.isEmpty()) return;
            String line = head.split("\r\n", 2)[0];
            String[] parts = line.split(" ");
            if (parts.length < 2) {
                writeText(s.getOutputStream(), 400, "bad request");
                return;
            }
            String path = parts[1];
            int q = path.indexOf('?');
            String query = q >= 0 ? path.substring(q + 1) : "";
            path = q >= 0 ? path.substring(0, q) : path;
            long[] range = parseRange(head);
            serve(ctx, s.getOutputStream(), path, query, range);
        } catch (Exception ignored) {
        }
    }

    private static void serve(Context ctx, OutputStream out, String path, String query, long[] range) throws IOException {
        if ("/".equals(path) || path.isEmpty()) {
            redirect(out, DataPackStore.isReady(ctx) ? "/engine/home.html" : "/engine/setup.html");
            return;
        }
        if (path.equals("/api/tts")) {
            serveTts(ctx, out, query);
            return;
        }
        if (path.startsWith("/engine/")) {
            serveAsset(ctx.getAssets(), out, "public" + path, range);
            return;
        }
        String rel = null;
        if (path.startsWith("/data/")) rel = path.substring("/data/".length());
        else if (path.startsWith("/assets/")) rel = "assets/" + path.substring("/assets/".length());
        if (rel == null) {
            writeText(out, 404, "not found");
            return;
        }
        try {
            DataPackStore.Source src = DataPackStore.resolve(ctx, rel);
            if (src == null) {
                writeText(out, 404, "not found");
                return;
            }
            serveSource(out, src, guessType(rel), range);
        } catch (FileNotFoundException e) {
            writeText(out, 404, "not found");
        }
    }

    private static void serveTts(Context ctx, OutputStream out, String query) throws IOException {
        String voice = "en";
        String text = "";
        for (String pair : query.split("&")) {
            int eq = pair.indexOf('=');
            if (eq < 0) continue;
            String k = decode(pair.substring(0, eq));
            String v = decode(pair.substring(eq + 1));
            if ("voice".equals(k)) voice = v;
            if ("text".equals(k)) text = v;
        }
        text = text.replaceAll("\\s+", " ").trim();
        if (text.isEmpty()) {
            writeText(out, 400, "bad text");
            return;
        }
        String folder = "zh".equals(voice) ? "sent_zh" : "sent_en";
        String rel = "assets/adv_audio/" + folder + "/" + md5_12(text) + ".mp3";
        try {
            DataPackStore.Source src = DataPackStore.resolve(ctx, rel);
            if (src == null) {
                writeText(out, 404, "no clip");
                return;
            }
            serveSource(out, src, "audio/mpeg", null);
        } catch (FileNotFoundException e) {
            writeText(out, 404, "no clip");
        }
    }

    private static void serveAsset(AssetManager am, OutputStream out, String assetPath, long[] range) throws IOException {
        try (InputStream in = am.open(assetPath)) {
            byte[] data = readAll(in);
            writeBytes(out, data, guessType(assetPath), range);
        } catch (IOException e) {
            writeText(out, 404, "not found");
        }
    }

    private static void serveSource(OutputStream out, DataPackStore.Source src, String ctype, long[] range) throws IOException {
        long size = src.size();
        if (size >= 0 && range != null) {
            long start = range[0];
            long end = range[1] < 0 ? size - 1 : Math.min(range[1], size - 1);
            if (start >= size) {
                writeText(out, 416, "range");
                return;
            }
            long length = end - start + 1;
            String headers = "HTTP/1.1 206 Partial Content\r\n"
                + "Content-Type: " + ctype + "\r\n"
                + "Content-Length: " + length + "\r\n"
                + "Accept-Ranges: bytes\r\n"
                + "Content-Range: bytes " + start + "-" + end + "/" + size + "\r\n"
                + "Connection: close\r\n\r\n";
            out.write(headers.getBytes(StandardCharsets.US_ASCII));
            try (InputStream in = src.open()) {
                skip(in, start);
                copy(in, out, length);
            }
            return;
        }
        if (size >= 0 && (range == null)) {
            String headers = "HTTP/1.1 200 OK\r\n"
                + "Content-Type: " + ctype + "\r\n"
                + "Content-Length: " + size + "\r\n"
                + "Accept-Ranges: bytes\r\n"
                + "Connection: close\r\n\r\n";
            out.write(headers.getBytes(StandardCharsets.US_ASCII));
            try (InputStream in = src.open()) {
                copy(in, out, size);
            }
            return;
        }
        try (InputStream in = src.open()) {
            writeBytes(out, readAll(in), ctype, range);
        }
    }

    private static void writeBytes(OutputStream out, byte[] data, String ctype, long[] range) throws IOException {
        int start = 0;
        int end = data.length - 1;
        int status = 200;
        String extra = "";
        if (range != null && data.length > 0) {
            start = (int) Math.max(0, range[0]);
            end = range[1] < 0 ? data.length - 1 : (int) Math.min(range[1], data.length - 1);
            status = 206;
            extra = "Content-Range: bytes " + start + "-" + end + "/" + data.length + "\r\n";
        }
        int length = Math.max(0, end - start + 1);
        String headers = "HTTP/1.1 " + status + (status == 206 ? " Partial Content" : " OK") + "\r\n"
            + "Content-Type: " + ctype + "\r\n"
            + "Content-Length: " + length + "\r\n"
            + "Accept-Ranges: bytes\r\n"
            + extra
            + "Connection: close\r\n\r\n";
        out.write(headers.getBytes(StandardCharsets.US_ASCII));
        if (length > 0) out.write(data, start, length);
    }

    private static void writeText(OutputStream out, int code, String msg) throws IOException {
        byte[] body = msg.getBytes(StandardCharsets.UTF_8);
        String headers = "HTTP/1.1 " + code + " ERR\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: "
            + body.length + "\r\nConnection: close\r\n\r\n";
        out.write(headers.getBytes(StandardCharsets.US_ASCII));
        out.write(body);
    }

    private static void redirect(OutputStream out, String to) throws IOException {
        String headers = "HTTP/1.1 302 Found\r\nLocation: " + to + "\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        out.write(headers.getBytes(StandardCharsets.US_ASCII));
    }

    private static String readHead(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        int n;
        while ((n = in.read()) != -1) {
            buf.write(n);
            byte[] b = buf.toByteArray();
            int L = b.length;
            if (L >= 4 && b[L - 4] == '\r' && b[L - 3] == '\n' && b[L - 2] == '\r' && b[L - 1] == '\n') {
                return new String(b, StandardCharsets.ISO_8859_1);
            }
            if (L > 64 * 1024) break;
        }
        return buf.toString(StandardCharsets.ISO_8859_1);
    }

    private static long[] parseRange(String head) {
        for (String line : head.split("\r\n")) {
            if (!line.toLowerCase(Locale.US).startsWith("range:")) continue;
            String v = line.substring(6).trim();
            if (!v.startsWith("bytes=")) continue;
            String spec = v.substring(6);
            int dash = spec.indexOf('-');
            if (dash < 0) return null;
            try {
                long a = spec.substring(0, dash).isEmpty() ? 0 : Long.parseLong(spec.substring(0, dash));
                long b = spec.substring(dash + 1).isEmpty() ? -1 : Long.parseLong(spec.substring(dash + 1));
                return new long[]{a, b};
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return null;
    }

    private static void skip(InputStream in, long n) throws IOException {
        long left = n;
        while (left > 0) {
            long s = in.skip(left);
            if (s > 0) {
                left -= s;
                continue;
            }
            if (in.read() < 0) return;
            left--;
        }
    }

    private static void copy(InputStream in, OutputStream out, long n) throws IOException {
        byte[] buf = new byte[64 * 1024];
        long left = n;
        while (left > 0) {
            int r = in.read(buf, 0, (int) Math.min(buf.length, left));
            if (r < 0) break;
            out.write(buf, 0, r);
            left -= r;
        }
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        byte[] buf = new byte[16 * 1024];
        int n;
        while ((n = in.read(buf)) >= 0) o.write(buf, 0, n);
        return o.toByteArray();
    }

    private static String guessType(String path) {
        String p = path.toLowerCase(Locale.US);
        if (p.endsWith(".html")) return "text/html; charset=utf-8";
        if (p.endsWith(".js")) return "text/javascript; charset=utf-8";
        if (p.endsWith(".css")) return "text/css; charset=utf-8";
        if (p.endsWith(".json")) return "application/json; charset=utf-8";
        if (p.endsWith(".mp4")) return "video/mp4";
        if (p.endsWith(".mp3")) return "audio/mpeg";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }

    private static String md5_12(String text) {
        try {
            byte[] d = MessageDigest.getInstance("MD5").digest(text.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : d) sb.append(String.format(Locale.US, "%02x", b));
            return sb.substring(0, 12);
        } catch (Exception e) {
            return "000000000000";
        }
    }

    private static String decode(String s) {
        try {
            return java.net.URLDecoder.decode(s, "UTF-8");
        } catch (Exception e) {
            return s;
        }
    }
}
