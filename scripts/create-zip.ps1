$source = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$dest = Join-Path (Split-Path $source -Parent) "$(Split-Path $source -Leaf)-source.zip"

# Directories to include (recurse into) — everything else is skipped
$includeTopDirs = @(
    '.github',
    '.vscode',
    'android',
    'docs',
    'scripts',
    'src'
)

# Sub-paths to exclude from recursion
$excludeSubPaths = @(
    '\build\',
    '\.gradle',
    '\.expo',
    '\.kotlin',
    '\.git\',
    '\node_modules\',
    'temp_aar',
    'tmp_smsmms'
)

$excludeExts = @('.hprof', '.aar', '.zip', '.apk', '.log')

Write-Host "Creating clean source zip..."

# Collect root-level files
$files = Get-ChildItem -Path $source -File -ErrorAction SilentlyContinue | Where-Object {
    $_.Extension -notin $excludeExts
}

# Collect files from included directories
foreach ($dir in $includeTopDirs) {
    $fullDir = Join-Path $source $dir
    if (-not (Test-Path $fullDir)) { continue }
    $dirFiles = Get-ChildItem -Path $fullDir -Recurse -File -ErrorAction SilentlyContinue | Where-Object {
        $relPath = $_.FullName.Substring($source.Length)
        $include = $true
        foreach ($excl in $excludeSubPaths) {
            if ($relPath -match [regex]::Escape($excl)) {
                $include = $false
                break
            }
        }
        $include -and $_.Extension -notin $excludeExts
    }
    $files += $dirFiles
}

Write-Host "Found $($files.Count) files to archive..."

$files | Compress-Archive -DestinationPath $dest -Force

if (Test-Path $dest) {
    $sizeMB = [math]::Round((Get-Item $dest).Length / 1MB, 1)
    Write-Host "Done! e_messages-source.zip - $sizeMB MB"
} else {
    Write-Host "ERROR: Zip was not created"
}
