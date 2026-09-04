@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 启动绘本（带音频 Range，不要用 http.server）
python -u tools\start_server.py "/engine/storybook.html?ep=1"
if errorlevel 1 pause
