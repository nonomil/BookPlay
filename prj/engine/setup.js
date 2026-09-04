"use strict";

const $ = (id) => document.getElementById(id);

function plugin() {
  return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.DataPack;
}

async function goHomeIfReady() {
  const pack = plugin();
  if (!pack) {
    $("st").textContent = "当前不是 APK。桌面请打开 home.html / 启动服务.bat。";
    return false;
  }
  const st = await pack.status();
  if (st && st.ready) {
    location.replace("home.html");
    return true;
  }
  $("st").textContent = st && st.message ? st.message : "还没有数据包。";
  return false;
}

async function pick(method, waiting) {
  const pack = plugin();
  if (!pack) {
    $("st").textContent = "桌面不用选文件，请用启动服务。";
    return;
  }
  $("st").textContent = waiting;
  try {
    const st = await pack[method]();
    if (st && st.ready) location.replace("home.html");
    else $("st").textContent = (st && st.message) || "没有选到有效数据包。";
  } catch (err) {
    $("st").textContent = String(err && err.message ? err.message : err);
  }
}

$("pick").addEventListener("click", () => pick("pickFolder", "打开系统文件夹选择…"));
$("pickZip").addEventListener("click", () => pick("pickZip", "打开数据包文件选择…"));

goHomeIfReady();
