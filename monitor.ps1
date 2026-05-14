$port = New-Object System.IO.Ports.SerialPort COM5, 115200, None, 8, one
try {
    $port.Open()
    Write-Host "--- Iniciando Monitor Serial en COM5 ---"
    for ($i=0; $i -lt 40; $i++) {
        if ($port.BytesToRead -gt 0) {
            Write-Host $port.ReadExisting() -NoNewline
        }
        Start-Sleep -Milliseconds 250
    }
} finally {
    $port.Close()
    Write-Host "`n--- Monitor Finalizado ---"
}
