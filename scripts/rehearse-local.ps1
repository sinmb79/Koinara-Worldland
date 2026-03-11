param(
  [string]$StandaloneNodePath = "..\\node",
  [string]$AnvilHost = "127.0.0.1",
  [int]$AnvilPort = 8545,
  [string]$OllamaModel = "",
  [switch]$KeepAnvilRunning
)

$ErrorActionPreference = "Stop"

function Write-Section {
  param([string]$Message)
  Write-Host ""
  Write-Host "== $Message =="
}

function Require-Command {
  param([string]$CommandName)
  if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $CommandName"
  }
}

function Invoke-JsonRpc {
  param(
    [string]$Uri,
    [string]$Method,
    [object[]]$Params = @()
  )

  $body = @{
    jsonrpc = "2.0"
    method = $Method
    params = $Params
    id = 1
  } | ConvertTo-Json -Depth 8 -Compress

  Invoke-RestMethod -Method Post -Uri $Uri -ContentType "application/json" -Body $body
}

function Wait-For-Rpc {
  param([string]$RpcUrl)

  for ($i = 0; $i -lt 30; $i += 1) {
    try {
      $result = Invoke-JsonRpc -Uri $RpcUrl -Method "eth_chainId"
      if ($result.result -eq "0x7a69") {
        return
      }
    } catch {
    }

    Start-Sleep -Seconds 1
  }

  throw "Anvil RPC did not become healthy at $RpcUrl"
}

function Get-MnemonicPrivateKey {
  param(
    [string]$CastPath,
    [string]$Mnemonic,
    [int]$Index
  )

  $value = & $CastPath wallet private-key --mnemonic $Mnemonic --mnemonic-index $Index
  return $value.Trim()
}

function Set-JsonFile {
  param(
    [string]$Path,
    [object]$Value
  )

  $parent = Split-Path -Parent $Path
  if (-not (Test-Path $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }

  $json = $Value | ConvertTo-Json -Depth 20
  [System.IO.File]::WriteAllText($Path, "$json`n")
}

function Set-TextFile {
  param(
    [string]$Path,
    [string]$Content
  )

  $parent = Split-Path -Parent $Path
  if (-not (Test-Path $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }

  [System.IO.File]::WriteAllText($Path, $Content)
}

function Invoke-Step {
  param(
    [string]$Label,
    [scriptblock]$Script
  )

  Write-Section $Label
  & $Script
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$standaloneRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $StandaloneNodePath))
$foundryBin = Join-Path $env:USERPROFILE ".foundry\\bin"
$forgePath = Join-Path $foundryBin "forge.exe"
$castPath = Join-Path $foundryBin "cast.exe"
$anvilPath = Join-Path $foundryBin "anvil.exe"
$rpcUrl = "http://$AnvilHost`:$AnvilPort"
$mnemonic = "test test test test test test test test test test test junk"
$worldlandNodeRoot = Join-Path $repoRoot "node"
$sharedNetworkRoot = Join-Path $worldlandNodeRoot ".koinara-worldland\\network"
$worldlandArtifactsRoot = Join-Path $worldlandNodeRoot ".koinara-worldland\\artifacts"
$worldlandStateRoot = Join-Path $worldlandNodeRoot ".koinara-worldland"
$standaloneStateRoot = Join-Path $standaloneRoot ".koinara-node"
$worldlandChainOverridePath = Join-Path $repoRoot "config\\chain.testnet.local.json"
$standaloneNetworksOverridePath = Join-Path $standaloneRoot "config\\networks.testnet.local.json"
$standaloneNodeConfigPath = Join-Path $standaloneRoot "node.config.json"
$standaloneEnvPath = Join-Path $standaloneRoot ".env.local"
$worldlandManifestPath = Join-Path $repoRoot "deployments\\worldland-testnet.json"
$anvilStdoutPath = Join-Path $worldlandStateRoot "anvil.stdout.log"
$anvilStderrPath = Join-Path $worldlandStateRoot "anvil.stderr.log"
$ollamaModelToUse = $OllamaModel

Require-Command npm
Require-Command node
Require-Command ollama

if (-not (Test-Path $forgePath)) {
  throw "forge.exe was not found at $forgePath"
}
if (-not (Test-Path $castPath)) {
  throw "cast.exe was not found at $castPath"
}
if (-not (Test-Path $anvilPath)) {
  throw "anvil.exe was not found at $anvilPath"
}
if (-not (Test-Path $standaloneRoot)) {
  throw "Standalone node path does not exist: $standaloneRoot"
}

if ([string]::IsNullOrWhiteSpace($ollamaModelToUse)) {
  $ollamaModels = (& ollama list | Select-Object -Skip 1 | ForEach-Object {
      if ($_ -match "^(\S+)") { $matches[1] }
    }) | Where-Object { $_ }

  if ($ollamaModels -contains "qwen3.5:latest") {
    $ollamaModelToUse = "qwen3.5:latest"
  } elseif ($ollamaModels.Count -gt 0) {
    $ollamaModelToUse = $ollamaModels[0]
  } else {
    throw "No Ollama models are installed. Run 'ollama pull <model>' first."
  }
}

$deployerKey = Get-MnemonicPrivateKey -CastPath $castPath -Mnemonic $mnemonic -Index 0
$providerKey = Get-MnemonicPrivateKey -CastPath $castPath -Mnemonic $mnemonic -Index 1
$verifierKey = Get-MnemonicPrivateKey -CastPath $castPath -Mnemonic $mnemonic -Index 2
$deployEnvironment = @{
  PRIVATE_KEY = $deployerKey
  CREATOR_PRIVATE_KEY = $deployerKey
  RPC_URL = $rpcUrl
  CHAIN_ID = "31337"
  CANARY_ROOT = $sharedNetworkRoot
}

Write-Section "Preparing dependencies"
Push-Location $repoRoot
try {
  if (-not (Test-Path (Join-Path $repoRoot "vendor\\koinara\\README.md"))) {
    git submodule update --init --recursive
  }
  if (-not (Test-Path (Join-Path $repoRoot "node_modules"))) {
    npm install
  }
} finally {
  Pop-Location
}

Push-Location $standaloneRoot
try {
  if (-not (Test-Path (Join-Path $standaloneRoot "node_modules"))) {
    npm install
  }
} finally {
  Pop-Location
}

Write-Section "Writing local override files"
if (Test-Path $sharedNetworkRoot) {
  Remove-Item $sharedNetworkRoot -Recurse -Force
}
if (Test-Path $worldlandArtifactsRoot) {
  Remove-Item $worldlandArtifactsRoot -Recurse -Force
}
if (Test-Path $standaloneStateRoot) {
  Remove-Item $standaloneStateRoot -Recurse -Force
}

Set-JsonFile -Path $worldlandChainOverridePath -Value @{
  chainId = 31337
  rpcUrl = $rpcUrl
  backupRpcUrls = @()
  explorerBaseUrl = ""
  confirmationsRequired = 1
  nativeToken = @{
    type = "native"
    symbol = "WLC"
  }
}

$localWorldlandNetwork = @{
  key = "worldland"
  label = "Worldland Local Anvil"
  kind = "evm"
  enabled = $true
  priority = 1
  networkRef = "worldland-local-anvil"
  rpcUrls = @($rpcUrl)
  chainId = 31337
  explorerBaseUrl = ""
  confirmationsRequired = 1
  recommendedGasBufferNative = "0.05"
  nativeToken = @{
    type = "native"
    symbol = "WLC"
  }
  contracts = @{
    registry = ""
    verifier = ""
    rewardDistributor = ""
    token = ""
  }
}

Set-JsonFile -Path $standaloneNetworksOverridePath -Value @{
  networks = @($localWorldlandNetwork)
}

$anvilProcess = $null
try {
  Write-Section "Starting Anvil"
  if (-not (Test-Path $worldlandStateRoot)) {
    New-Item -ItemType Directory -Path $worldlandStateRoot -Force | Out-Null
  }

  $anvilProcess = Start-Process -FilePath $anvilPath `
    -ArgumentList @("--host", $AnvilHost, "--port", "$AnvilPort", "--chain-id", "31337", "--mnemonic=`"$mnemonic`"") `
    -PassThru `
    -WindowStyle Hidden `
    -RedirectStandardOutput $anvilStdoutPath `
    -RedirectStandardError $anvilStderrPath

  Wait-For-Rpc -RpcUrl $rpcUrl

  Invoke-Step -Label "Deploying Koinara to local Anvil" -Script {
    Push-Location $repoRoot
    try {
      foreach ($entry in $deployEnvironment.GetEnumerator()) {
        Set-Item -Path "Env:$($entry.Key)" -Value $entry.Value
      }
      npm run deploy:testnet
      npm run verify:testnet
    } finally {
      Pop-Location
    }
  }

  $deploymentManifest = Get-Content $worldlandManifestPath | ConvertFrom-Json
  $localWorldlandNetwork.contracts.registry = $deploymentManifest.contractAddresses.registry
  $localWorldlandNetwork.contracts.verifier = $deploymentManifest.contractAddresses.verifier
  $localWorldlandNetwork.contracts.rewardDistributor = $deploymentManifest.contractAddresses.rewardDistributor
  $localWorldlandNetwork.contracts.token = $deploymentManifest.contractAddresses.token
  Set-JsonFile -Path $standaloneNetworksOverridePath -Value @{ networks = @($localWorldlandNetwork) }

  Invoke-Step -Label "Creating canary manifest and on-chain job" -Script {
    Push-Location $repoRoot
    try {
      foreach ($entry in $deployEnvironment.GetEnumerator()) {
        Set-Item -Path "Env:$($entry.Key)" -Value $entry.Value
      }
      npm run canary:testnet
    } finally {
      Pop-Location
    }
  }

  Invoke-Step -Label "Running standalone provider pass" -Script {
    Set-JsonFile -Path $standaloneNodeConfigPath -Value @{
      networkProfile = "testnet"
      selectionMode = "priority-failover"
      enabledNetworks = @("worldland")
      pollIntervalMs = 1000
      manifestRoots = @($sharedNetworkRoot)
      receiptRoots = @($sharedNetworkRoot)
      artifactOutputDir = (Join-Path $standaloneStateRoot "artifacts")
      provider = @{
        backend = "ollama"
        supportedJobTypes = @("Simple")
        ollama = @{
          baseUrl = "http://127.0.0.1:11434"
          model = $ollamaModelToUse
        }
      }
    }
    Set-TextFile -Path $standaloneEnvPath -Content @"
WALLET_PRIVATE_KEY=$providerKey
NODE_ROLE=provider
NETWORK_PROFILE=testnet
"@
    Push-Location $standaloneRoot
    try {
      npm run doctor
      npm run node:once
    } finally {
      Pop-Location
    }
  }

  Invoke-Step -Label "Running standalone verifier pass" -Script {
    Set-JsonFile -Path $standaloneNodeConfigPath -Value @{
      networkProfile = "testnet"
      selectionMode = "priority-failover"
      enabledNetworks = @("worldland")
      pollIntervalMs = 1000
      manifestRoots = @($sharedNetworkRoot)
      receiptRoots = @($sharedNetworkRoot)
      artifactOutputDir = (Join-Path $standaloneStateRoot "artifacts")
      verifier = @{
        supportedJobTypes = @("Simple", "General", "Collective")
        supportedSchemaHashes = @()
      }
    }
    Set-TextFile -Path $standaloneEnvPath -Content @"
WALLET_PRIVATE_KEY=$verifierKey
NODE_ROLE=verifier
NETWORK_PROFILE=testnet
"@
    Push-Location $standaloneRoot
    try {
      npm run doctor
      npm run node:once
      npm run status
    } finally {
      Pop-Location
    }
  }

  Invoke-Step -Label "Confirming final on-chain job state" -Script {
    $jobCount = & $castPath call $deploymentManifest.contractAddresses.registry "totalJobs()(uint256)" --rpc-url $rpcUrl

    Write-Host "Local deployment manifest: $worldlandManifestPath"
    Write-Host "Shared network root: $sharedNetworkRoot"
    Write-Host "Standalone node config: $standaloneNodeConfigPath"
    Write-Host "Last observed job count: $jobCount"
    Write-Host "Provider model: $ollamaModelToUse"
  }
} finally {
  if ($anvilProcess -and -not $KeepAnvilRunning) {
    Write-Section "Stopping Anvil"
    Stop-Process -Id $anvilProcess.Id -Force -ErrorAction SilentlyContinue
  }
}
