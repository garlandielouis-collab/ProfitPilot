@echo off
REM Use this helper if you need a Windows cmd wrapper to run the PowerShell script.
REM Make sure Git is installed and available in the PATH or in the default Git for Windows location.

powershell.exe -ExecutionPolicy Bypass -File "%~dp0restore_claude_changes.ps1" %*
