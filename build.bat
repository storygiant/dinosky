@echo off
setlocal enabledelayedexpansion

echo ===============================
echo   BUILD + PACKAGE SCRIPT
echo ===============================
echo.

REM -----------------------------
REM 1. Set project path
REM -----------------------------
set "projectPath=%cd%"
set "filesPath=%projectPath%\dragon"

REM -----------------------------
REM 3. Delete old generated zips only
REM -----------------------------
echo Removing old zips...
del /q "%projectPath%\dragon_*.zip" 2>nul

REM -----------------------------
REM 7. Generate timestamp
REM -----------------------------
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm-ss"') do set timestamp=%%i

set "outputZip=%projectPath%\dragon_!timestamp!.zip"
echo Output zip: "!outputZip!"

REM -----------------------------
REM 8. Locate 7-Zip
REM -----------------------------
set "zipExe="

REM Preferred custom path
if exist "d:\programs\7-Zip\7z.exe" set "zipExe=d:\programs\7-Zip\7z.exe"

REM Check PATH
if not defined zipExe (
    for %%i in (7z.exe) do set "zipExe=%%~$PATH:i"
)

REM Common install locations
if not defined zipExe if exist "%ProgramFiles%\7-Zip\7z.exe" set "zipExe=%ProgramFiles%\7-Zip\7z.exe"
if not defined zipExe if exist "%ProgramFiles(x86)%\7-Zip\7z.exe" set "zipExe=%ProgramFiles(x86)%\7-Zip\7z.exe"

if not defined zipExe (
    echo [ERROR] 7z.exe not found. Please install 7-Zip or add it to PATH.
    pause
    exit /b 1
)

echo Using 7-Zip: "!zipExe!"

REM -----------------------------
REM 9. Zip dist folder
REM -----------------------------
"!zipExe!" a -tzip "!outputZip!" "%filesPath%\*" -mx9
if errorlevel 1 (
    echo [ERROR] Failed to create zip
    pause
    exit /b 1
)

echo.
echo SUCCESS [OK]
echo Created: "!outputZip!"

REM -----------------------------
REM 10. Open Poki page
REM -----------------------------
start "" "https://app.poki.dev/story-giant-games/games/243cb571-38f5-4381-9be2-9e4febbc25f8/versions"

REM pause