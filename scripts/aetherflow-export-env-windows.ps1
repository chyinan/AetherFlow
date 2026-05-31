$envFile = Join-Path (Resolve-Path ".") ".env"
if (-not (Test-Path $envFile)) {
    throw ".env not found"
}

Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
        return
    }
    $name, $value = $line.Split("=", 2)
    [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), "User")
    Write-Host "set $($name.Trim())"
}

Write-Host "Restart terminals/IDE processes to pick up user environment variables."
