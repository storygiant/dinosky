$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = if (Test-Path -LiteralPath (Join-Path $scriptDir 'package.json')) {
  $scriptDir
} elseif (Test-Path -LiteralPath (Join-Path $scriptDir 'dyno\package.json')) {
  Join-Path $scriptDir 'dyno'
} else {
  throw 'Could not find dyno game folder from build-desktop.ps1 location.'
}

$outputDir = Split-Path -Parent $root
$buildOutputDir = Join-Path $outputDir ('.tmp_desktop_build_' + [DateTime]::Now.ToString('yyyyMMdd_HHmmss'))
$builderCmd = Join-Path $root 'node_modules\.bin\electron-builder.cmd'

if (-not (Test-Path -LiteralPath $builderCmd)) {
  throw 'electron-builder.cmd not found. Run npm install first.'
}

New-Item -ItemType Directory -Path $buildOutputDir -Force | Out-Null

Push-Location $root
try {
  $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
  & $builderCmd --win nsis portable "-c.directories.output=$buildOutputDir"
  if ($LASTEXITCODE -ne 0) {
    throw "Desktop build failed with exit code $LASTEXITCODE."
  }
} finally {
  Pop-Location
}

if (-not (Test-Path -LiteralPath $buildOutputDir)) {
  throw 'Temporary desktop output folder was not created.'
}

$setupExecutables = Get-ChildItem -LiteralPath $buildOutputDir -Filter '*Setup*.exe' -File -ErrorAction SilentlyContinue
$executablesToCopy = if ($setupExecutables) {
  $setupExecutables
} else {
  Get-ChildItem -LiteralPath $buildOutputDir -Filter '*.exe' -File -ErrorAction SilentlyContinue
}

if (-not $executablesToCopy) {
  throw 'No desktop installer executable was found in the release folder.'
}

foreach ($exe in $executablesToCopy) {
  $destinationPath = Join-Path $outputDir $exe.Name
  Copy-Item -LiteralPath $exe.FullName -Destination $destinationPath -Force
  Write-Host "Copied desktop executable:" $destinationPath
}

Remove-Item -LiteralPath $buildOutputDir -Recurse -Force

Write-Host 'Desktop build completed successfully.'
