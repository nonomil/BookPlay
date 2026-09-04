@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "release" mkdir "release"
set "PACK_VERSION=0.1.8"
set "PACK_OUT=release/西游记数据包-%PACK_VERSION%-c01-ep01.zip"
python -X utf8 -u prj/tools/pack_datapack.py --collections c01 --episodes 1 --published all --version %PACK_VERSION% --out "%PACK_OUT%"
python -X utf8 -u prj/tools/report_stage_pack.py "%PACK_OUT%" --out "docs/reports/2026-09-04-c01-ep01-阶段数据包体积.md"
echo.
echo ZIP: %PACK_OUT%
echo.
echo 这是 C01 第 1 集体验包，保留公共索引、公共音频和已发布绘本资源。
pause
