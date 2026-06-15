$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = if (Test-Path -LiteralPath (Join-Path $scriptDir 'VERSION.txt')) {
  $scriptDir
} elseif (Test-Path -LiteralPath (Join-Path $scriptDir 'dyno\VERSION.txt')) {
  Join-Path $scriptDir 'dyno'
} else {
  throw 'Could not find dyno game folder from build-poki.ps1 location.'
}
$outputDir = Split-Path -Parent $root
$stagingDir = Join-Path $outputDir '.tmp_poki_export'
$versionFilePath = Join-Path $root 'VERSION.txt'

$excludeDirectories = @(
  '.git',
  '.vscode',
  '.claude',
  '.codex',
  '.agents',
  'node_modules',
  'desktop',
  'release',
  'dist'
)

$excludeFiles = @(
  'package.json',
  'package-lock.json',
  'STEAM_DESKTOP_WRAPPER.md',
  'build-poki.cmd',
  'build-poki.ps1',
  'FILE_INDEX.md',
  'build-desktop.ps1',
  'gameplay.png'
)

function New-ZipFromDirectory {
  param(
    [string]$SourceDir,
    [string]$DestinationZip
  )

  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem

  $zipFileStream = [System.IO.File]::Open($DestinationZip, [System.IO.FileMode]::Create)
  try {
    $zipArchive = New-Object System.IO.Compression.ZipArchive(
      $zipFileStream,
      [System.IO.Compression.ZipArchiveMode]::Create,
      $false
    )
    try {
      Get-ChildItem -LiteralPath $SourceDir -Recurse -File | ForEach-Object {
        $entryPath = $_.FullName.Substring($SourceDir.Length).TrimStart('\').Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
          $zipArchive,
          $_.FullName,
          $entryPath,
          [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
      }
    } finally {
      $zipArchive.Dispose()
    }
  } finally {
    $zipFileStream.Dispose()
  }
}

function Copy-PokiFiles {
  param(
    [string]$SourceDir,
    [string]$DestinationDir
  )

  Get-ChildItem -LiteralPath $SourceDir -Force | ForEach-Object {
    $name = $_.Name
    $destinationPath = Join-Path $DestinationDir $name
    $fullName = $_.FullName
    $relativePath = if ($fullName.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
      $fullName.Substring($root.Length).TrimStart('\').Replace('\', '/')
    } else {
      $name
    }

    if ($_.PSIsContainer) {
      if ($relativePath -eq 'gfx/levels/dummy') {
        New-Item -ItemType Directory -Path $destinationPath -Force | Out-Null
        $tsxSource = Join-Path $_.FullName 'dummies.tsx'
        if (Test-Path -LiteralPath $tsxSource) {
          Copy-Item -LiteralPath $tsxSource -Destination (Join-Path $destinationPath 'dummies.tsx') -Force
        }
        return
      }

      if ($excludeDirectories -contains $name) {
        return
      }

      New-Item -ItemType Directory -Path $destinationPath -Force | Out-Null
      Copy-PokiFiles -SourceDir $_.FullName -DestinationDir $destinationPath
      return
    }

    if ($excludeFiles -contains $name) {
      return
    }

    if ($name -like 'dyno_*.zip') {
      return
    }

    Copy-Item -LiteralPath $_.FullName -Destination $destinationPath -Force
  }
}

function Get-NextVersion {
  param(
    [string]$CurrentVersion
  )

  if ([string]::IsNullOrWhiteSpace($CurrentVersion)) {
    throw 'VERSION.txt is empty.'
  }

  $trimmedVersion = $CurrentVersion.Trim()
  $parts = $trimmedVersion.Split('.')
  if ($parts.Count -ne 3) {
    throw "Unsupported version format in VERSION.txt: $trimmedVersion"
  }

  $major = [int]$parts[0]
  $minor = [int]$parts[1]
  $patch = [int]$parts[2]

  return "$major.$minor.$($patch + 1)"
}

if (-not (Test-Path -LiteralPath $versionFilePath)) {
  throw 'VERSION.txt not found.'
}

$currentVersion = Get-Content -LiteralPath $versionFilePath -Raw
$nextVersion = Get-NextVersion -CurrentVersion $currentVersion
$zipFileName = "dyno_$nextVersion.zip"
$zipPath = Join-Path $outputDir $zipFileName

if (Test-Path -LiteralPath $stagingDir) {
  Remove-Item -LiteralPath $stagingDir -Recurse -Force
}

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Set-Content -LiteralPath $versionFilePath -Value $nextVersion -NoNewline

New-Item -ItemType Directory -Path $stagingDir -Force | Out-Null
Copy-PokiFiles -SourceDir $root -DestinationDir $stagingDir

New-ZipFromDirectory -SourceDir $stagingDir -DestinationZip $zipPath

Remove-Item -LiteralPath $stagingDir -Recurse -Force

Write-Host "Updated version to:" $nextVersion
Write-Host "Created Poki export:" $zipPath
