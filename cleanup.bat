@echo off
cd /d "%~dp0"

:: Eliminar index.lock si existe
del /f ".git\index.lock" 2>nul

:: Eliminar bat files muertos del disco
del /f "git-push.bat" 2>nul
del /f "git-sync-push.bat" 2>nul
del /f "fix-push.bat" 2>nul
del /f "build-local.bat" 2>nul
echo Archivos muertos eliminados.

:: Commit: registrar eliminaciones + vite.config.ts ya escrito por consola
git add -A
git commit -m "chore: remove dead bat files, revert cacheDir from vite.config"
echo.
echo Hecho. Ejecuta iniciar-dev.bat para levantar el servidor local.
pause
