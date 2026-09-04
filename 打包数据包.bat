@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "release" mkdir "release"
set "PACK_VERSION=0.1.8"
set "PACK_OUT=release/西游记数据包-%PACK_VERSION%-c01.zip"
python -X utf8 -u prj/tools/pack_datapack.py --collections c01 --published all --version %PACK_VERSION% --out "%PACK_OUT%"
python -X utf8 -u prj/tools/report_stage_pack.py "%PACK_OUT%" --out "docs/reports/2026-09-04-c01-阶段数据包体积.md"
echo.
echo ZIP: %PACK_OUT%
echo.
echo 首页封面及篇章背景由 pack_datapack.py 的 COMMON_FILES 和合辑引用闭包一并打包。
pause
