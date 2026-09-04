@echo off
chcp 65001 >nul
cd /d "%~dp0"
python -u "prj\tools\start_server.py" /engine/home.html
if errorlevel 1 (
  echo 没找到 Python，或没有可用端口。
  pause
)
