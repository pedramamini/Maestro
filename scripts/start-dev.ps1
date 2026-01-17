# Opens two PowerShell windows: one for renderer dev, one for building and running Electron
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/start-dev.ps1

$repoRoot = Resolve-Path -Path (Join-Path $PSScriptRoot '..')
$repoRoot = $repoRoot.Path

# escape single quotes for embedding in command strings
$repoRootEscaped = $repoRoot -replace "'","''"

$cmdRenderer = "Set-Location -LiteralPath '$repoRootEscaped'; npm run dev:renderer"
Start-Process powershell -ArgumentList '-NoExit', '-Command', $cmdRenderer

$cmdBuild = "Set-Location -LiteralPath '$repoRootEscaped'; npm run build:prompts; npx tsc -p tsconfig.main.json; `$env:NODE_ENV='development'; npx electron ."
Start-Process powershell -ArgumentList '-NoExit', '-Command', $cmdBuild

Write-Host "Launched renderer and main developer windows." -ForegroundColor Green
