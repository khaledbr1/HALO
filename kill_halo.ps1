# Helper script to cleanly stop all running Halo instances
Stop-Process -Name electron -Force -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*worker.py*' } | ForEach-Object { 
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue 
}
Write-Host "✦ All Halo processes have been stopped." -ForegroundColor Green
