# Installs the latest TOFO release on Windows.
#   irm https://raw.githubusercontent.com/PromptFarm/tofo/main/install.ps1 | iex
$ErrorActionPreference = "Stop"

$repo = "PromptFarm/tofo"
$installDir = "$env:LOCALAPPDATA\Programs\TOFO"

Write-Host "Finding the latest TOFO release..."
$release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest"
$asset = $release.assets | Where-Object { $_.name -like "*windows-x64.zip" } | Select-Object -First 1

if (-not $asset) {
    Write-Error "Couldn't find a Windows .zip in the latest release. Grab it manually: https://github.com/$repo/releases/latest"
    exit 1
}

$zipPath = Join-Path $env:TEMP $asset.name
Write-Host "Downloading $($asset.browser_download_url)"
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath

Write-Host "Installing to $installDir..."
if (Test-Path $installDir) {
    Remove-Item -Recurse -Force $installDir
}
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
Expand-Archive -LiteralPath $zipPath -DestinationPath $installDir -Force
Remove-Item $zipPath

# The zip contains a single top-level "TOFO" folder — flatten it so
# TOFO.exe lands directly in $installDir.
$inner = Join-Path $installDir "TOFO"
if (Test-Path $inner) {
    Get-ChildItem $inner | Move-Item -Destination $installDir -Force
    Remove-Item $inner -Force
}

$exePath = Join-Path $installDir "TOFO.exe"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut("$env:APPDATA\Microsoft\Windows\Start Menu\Programs\TOFO.lnk")
$shortcut.TargetPath = $exePath
$shortcut.WorkingDirectory = $installDir
$shortcut.Save()

Write-Host "TOFO installed to $installDir and added to the Start Menu."
Write-Host "Launch it now? [Y/n] " -NoNewline
$response = Read-Host
if ($response -eq "" -or $response -eq "Y" -or $response -eq "y") {
    Start-Process -FilePath $exePath -WorkingDirectory $installDir
}
