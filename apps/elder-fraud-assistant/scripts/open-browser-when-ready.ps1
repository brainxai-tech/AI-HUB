param(
  [string]$Url = "http://127.0.0.1:4182/",
  [switch]$NoOpen
)

$ErrorActionPreference = "SilentlyContinue"

for ($attempt = 1; $attempt -le 20; $attempt++) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 1
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
      if (-not $NoOpen) {
        Start-Process $Url
      }
      exit 0
    }
  } catch {
  }

  Start-Sleep -Milliseconds 500
}

if (-not $NoOpen) {
  Start-Process $Url
}

exit 1
