@echo off
chcp 65001 >nul
cd /d "%~dp0"
python -u prj/tools/serve.py --port 8820 --data-root "%~dp0content" --engine-root "%~dp0prj\engine"
pause
