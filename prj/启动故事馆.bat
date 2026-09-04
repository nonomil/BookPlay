@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 启动故事馆（带视频 Range，不要用 http.server）
python -u tools\start_server.py /engine/home.html
if errorlevel 1 pause
