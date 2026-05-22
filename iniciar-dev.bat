@echo off
title Cafe Stock - Servidor de Desarrollo
color 0A
echo.
echo  ╔══════════════════════════════════════╗
echo  ║      Cafe Stock - Dev Server         ║
echo  ║      http://localhost:5173           ║
echo  ╚══════════════════════════════════════╝
echo.
echo  Iniciando servidor...
echo  Presiona Ctrl+C para detener.
echo.

cd /d "%~dp0"
npx vite --open

pause
