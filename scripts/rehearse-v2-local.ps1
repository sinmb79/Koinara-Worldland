param(
  [string]$StandaloneNodePath = "..\\node",
  [string]$AnvilHost = "127.0.0.1",
  [int]$AnvilPort = 8545,
  [string]$OllamaModel = "",
  [int]$EpochDurationSeconds = 60,
  [int]$GenesisOffsetSeconds = 20,
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

function Assert-JsonRpcSuccess {
  param(
    [object]$Response,
    [string]$Method
  )

  if ($null -ne $Response.error) {
    throw "JSON-RPC $Method failed: $($Response.error | ConvertTo-Json -Compress)"
  }
}

function Test-OllamaHealthy {
  try {
    Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:11434/api/tags" | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Wait-For-Ollama {
  param([int]$TimeoutSeconds = 30)

  for ($i = 0; $i -lt $TimeoutSeconds; $i += 1) {
    if (Test-OllamaHealthy) {
      return
    }
    Start-Sleep -Seconds 1
  }

  throw "Ollama server did not become healthy on http://127.0.0.1:11434"
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

function Get-AddressFromPrivateKey {
  param(
    [string]$CastPath,
    [string]$PrivateKey
  )

  $value = & $CastPath wallet address --private-key $PrivateKey
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

function Get-ContractUint {
  param(
    [string]$NodeWorkingDirectory,
    [string]$RpcUrl,
    [string]$ContractAddress,
    [string]$AbiSignature,
    [string]$MethodName,
    [object[]]$Arguments = @()
  )

  $env:KOINARA_READ_RPC_URL = $RpcUrl
  $env:KOINARA_READ_CONTRACT_ADDRESS = $ContractAddress
  $env:KOINARA_READ_ABI_SIGNATURE = $AbiSignature
  $env:KOINARA_READ_METHOD_NAME = $MethodName
  $env:KOINARA_READ_ARGS_JSON = (@($Arguments) | ConvertTo-Json -Compress -Depth 10)

  Push-Location $NodeWorkingDirectory
  try {
    $output = @'
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider(process.env.KOINARA_READ_RPC_URL);
const contract = new ethers.Contract(
  process.env.KOINARA_READ_CONTRACT_ADDRESS,
  [process.env.KOINARA_READ_ABI_SIGNATURE],
  provider
);
const parsedArgs = JSON.parse(process.env.KOINARA_READ_ARGS_JSON || "[]");
const args = Array.isArray(parsedArgs) ? parsedArgs : [parsedArgs];
const value = await contract[process.env.KOINARA_READ_METHOD_NAME](...args);
console.log(value.toString());
provider.destroy();
'@ | node --input-type=module -
  } finally {
    Pop-Location
  }

  return [bigint]::Parse($output.Trim())
}

function Invoke-NodeRolePass {
  param(
    [string]$StandaloneRoot,
    [string]$NodeConfigPath,
    [string]$NetworksPath,
    [string]$EnvFilePath,
    [string]$Role,
    [string]$StateDir
  )

  Push-Location $StandaloneRoot
  try {
    $env:NODE_CONFIG_FILE = $NodeConfigPath
    $env:NODE_NETWORKS_FILE = $NetworksPath
    $env:NODE_ENV_FILE = $EnvFilePath
    $env:NODE_ROLE = $Role
    $env:NETWORK_PROFILE = "testnet"
    $env:NODE_STATE_DIR = $StateDir
    npm run doctor
    if ($LASTEXITCODE -ne 0) {
      throw "npm run doctor failed for role $Role"
    }
    npm run node:once
    if ($LASTEXITCODE -ne 0) {
      throw "npm run node:once failed for role $Role"
    }
  } finally {
    Pop-Location
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$standaloneRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $StandaloneNodePath))
$foundryBin = Join-Path $env:USERPROFILE ".foundry\\bin"
$forgePath = Join-Path $foundryBin "forge.exe"
$castPath = Join-Path $foundryBin "cast.exe"
$anvilPath = Join-Path $foundryBin "anvil.exe"
$rpcUrl = "http://$AnvilHost`:$AnvilPort"
$mnemonic = "test test test test test test test test test test test junk"
$worldlandStateRoot = Join-Path $repoRoot ".koinara-worldland-v2"
$sharedNetworkRoot = Join-Path $worldlandStateRoot "network"
$standaloneStateRoot = Join-Path $standaloneRoot ".koinara-node-v2-local"
$providerStateRoot = Join-Path $standaloneStateRoot "provider"
$verifierStateRoot = Join-Path $standaloneStateRoot "verifier"
$worldlandChainConfigPath = Join-Path $repoRoot "config\\chain.testnet.v2-local.json"
$standaloneNetworksPath = Join-Path $standaloneRoot "config\\networks.testnet.v2-local.json"
$standaloneNodeConfigPath = Join-Path $standaloneRoot "node.config.v2-local.json"
$providerEnvPath = Join-Path $standaloneRoot ".env.v2-provider.local"
$verifierEnvPath = Join-Path $standaloneRoot ".env.v2-verifier.local"
$worldlandManifestPath = Join-Path $repoRoot "deployments\\worldland-testnet-v2.json"
$anvilStdoutPath = Join-Path $worldlandStateRoot "anvil.stdout.log"
$anvilStderrPath = Join-Path $worldlandStateRoot "anvil.stderr.log"
$ollamaStdoutPath = Join-Path $worldlandStateRoot "ollama.stdout.log"
$ollamaStderrPath = Join-Path $worldlandStateRoot "ollama.stderr.log"
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
$providerAddress = Get-AddressFromPrivateKey -CastPath $castPath -PrivateKey $providerKey
$verifierAddress = Get-AddressFromPrivateKey -CastPath $castPath -PrivateKey $verifierKey
$genesisTimestamp = [int][double]::Parse((Get-Date -UFormat %s)) + $GenesisOffsetSeconds

$deployEnvironment = @{
  PRIVATE_KEY = $deployerKey
  CREATOR_PRIVATE_KEY = $deployerKey
  RPC_URL = $rpcUrl
  CHAIN_ID = "31337"
  CHAIN_CONFIG_FILE = $worldlandChainConfigPath
  CANARY_ROOT = $sharedNetworkRoot
  DEPLOYMENT_VERSION = "v2"
  EPOCH_DURATION = "$EpochDurationSeconds"
  HALVING_INTERVAL = "365"
  INITIAL_EPOCH_EMISSION_WEI = "1000000000000000000000"
  ACTIVE_POOL_BPS = "2000"
  GENESIS_TIMESTAMP = "$genesisTimestamp"
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

Write-Section "Writing v2 local override files"
if (Test-Path $worldlandStateRoot) {
  Remove-Item $worldlandStateRoot -Recurse -Force
}
if (Test-Path $standaloneStateRoot) {
  Remove-Item $standaloneStateRoot -Recurse -Force
}

Set-JsonFile -Path $worldlandChainConfigPath -Value @{
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
  label = "Worldland Local Anvil v2"
  kind = "evm"
  enabled = $true
  priority = 1
  networkRef = "worldland-local-anvil-v2"
  rpcUrls = @($rpcUrl)
  chainId = 31337
  explorerBaseUrl = ""
  confirmationsRequired = 1
  recommendedGasBufferNative = "0.05"
  nativeToken = @{
    type = "native"
    symbol = "WLC"
  }
  protocolVersion = "v2"
  contracts = @{
    registry = ""
    verifier = ""
    rewardDistributor = ""
    token = ""
    nodeRegistry = ""
  }
}

Set-JsonFile -Path $standaloneNetworksPath -Value @{
  networks = @($localWorldlandNetwork)
}

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
  verifier = @{
    supportedJobTypes = @("Simple", "General", "Collective")
    supportedSchemaHashes = @()
  }
}

Set-TextFile -Path $providerEnvPath -Content @"
WALLET_PRIVATE_KEY=$providerKey
NETWORK_PROFILE=testnet
"@

Set-TextFile -Path $verifierEnvPath -Content @"
WALLET_PRIVATE_KEY=$verifierKey
NETWORK_PROFILE=testnet
"@

$anvilProcess = $null
$ollamaProcess = $null
try {
  Write-Section "Ensuring Ollama is available"
  New-Item -ItemType Directory -Path $worldlandStateRoot -Force | Out-Null
  if (-not (Test-OllamaHealthy)) {
    $ollamaCommand = (Get-Command ollama).Source
    $ollamaProcess = Start-Process -FilePath $ollamaCommand `
      -ArgumentList @("serve") `
      -PassThru `
      -WindowStyle Hidden `
      -RedirectStandardOutput $ollamaStdoutPath `
      -RedirectStandardError $ollamaStderrPath
    Wait-For-Ollama
  }

  Write-Section "Starting Anvil"
  $anvilProcess = Start-Process -FilePath $anvilPath `
    -ArgumentList @("--host", $AnvilHost, "--port", "$AnvilPort", "--chain-id", "31337", "--mnemonic=`"$mnemonic`"") `
    -PassThru `
    -WindowStyle Hidden `
    -RedirectStandardOutput $anvilStdoutPath `
    -RedirectStandardError $anvilStderrPath

  Wait-For-Rpc -RpcUrl $rpcUrl

  Invoke-Step -Label "Deploying Worldland v2 to local Anvil" -Script {
    Push-Location $repoRoot
    try {
      foreach ($entry in $deployEnvironment.GetEnumerator()) {
        Set-Item -Path "Env:$($entry.Key)" -Value $entry.Value
      }
      npm run deploy:v2:testnet
      npm run verify:v2:testnet
    } finally {
      Pop-Location
    }
  }

  $deploymentManifest = Get-Content $worldlandManifestPath | ConvertFrom-Json
  $localWorldlandNetwork.contracts.registry = $deploymentManifest.contractAddresses.registry
  $localWorldlandNetwork.contracts.verifier = $deploymentManifest.contractAddresses.verifier
  $localWorldlandNetwork.contracts.rewardDistributor = $deploymentManifest.contractAddresses.rewardDistributor
  $localWorldlandNetwork.contracts.token = $deploymentManifest.contractAddresses.token
  $localWorldlandNetwork.contracts.nodeRegistry = $deploymentManifest.contractAddresses.nodeRegistry
  Set-JsonFile -Path $standaloneNetworksPath -Value @{ networks = @($localWorldlandNetwork) }

  Invoke-Step -Label "Creating v2 canary job" -Script {
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

  Invoke-Step -Label "Running provider first pass" -Script {
    Invoke-NodeRolePass `
      -StandaloneRoot $standaloneRoot `
      -NodeConfigPath $standaloneNodeConfigPath `
      -NetworksPath $standaloneNetworksPath `
      -EnvFilePath $providerEnvPath `
      -Role "provider" `
      -StateDir $providerStateRoot
  }

  Invoke-Step -Label "Running verifier first pass" -Script {
    Invoke-NodeRolePass `
      -StandaloneRoot $standaloneRoot `
      -NodeConfigPath $standaloneNodeConfigPath `
      -NetworksPath $standaloneNetworksPath `
      -EnvFilePath $verifierEnvPath `
      -Role "verifier" `
      -StateDir $verifierStateRoot
  }

  Invoke-Step -Label "Waiting for epoch close" -Script {
    $currentEpoch = Get-ContractUint `
      -NodeWorkingDirectory $repoRoot `
      -RpcUrl $rpcUrl `
      -ContractAddress $deploymentManifest.contractAddresses.nodeRegistry `
      -AbiSignature "function currentEpoch() view returns (uint256)" `
      -MethodName "currentEpoch"

    if ($currentEpoch -gt 0) {
      Write-Host "Epoch $currentEpoch is already claimable for epoch 0 rewards."
    } else {
      $targetTimestamp = [int64]$deploymentManifest.epochParams.genesisTimestamp + $EpochDurationSeconds + 5
      $setTimestampResponse = Invoke-JsonRpc -Uri $rpcUrl -Method "evm_setNextBlockTimestamp" -Params @($targetTimestamp)
      Assert-JsonRpcSuccess -Response $setTimestampResponse -Method "evm_setNextBlockTimestamp"
      $mineResponse = Invoke-JsonRpc -Uri $rpcUrl -Method "evm_mine"
      Assert-JsonRpcSuccess -Response $mineResponse -Method "evm_mine"
      $observedEpoch = Get-ContractUint `
        -NodeWorkingDirectory $repoRoot `
        -RpcUrl $rpcUrl `
        -ContractAddress $deploymentManifest.contractAddresses.nodeRegistry `
        -AbiSignature "function currentEpoch() view returns (uint256)" `
        -MethodName "currentEpoch"
      if ($observedEpoch -le $currentEpoch) {
        throw "Failed to advance the local chain into the next epoch"
      }

      Write-Host "Epoch advanced from $currentEpoch to $observedEpoch"
    }
  }

  Invoke-Step -Label "Running provider claim pass" -Script {
    Invoke-NodeRolePass `
      -StandaloneRoot $standaloneRoot `
      -NodeConfigPath $standaloneNodeConfigPath `
      -NetworksPath $standaloneNetworksPath `
      -EnvFilePath $providerEnvPath `
      -Role "provider" `
      -StateDir $providerStateRoot
  }

  Invoke-Step -Label "Running verifier claim pass" -Script {
    Invoke-NodeRolePass `
      -StandaloneRoot $standaloneRoot `
      -NodeConfigPath $standaloneNodeConfigPath `
      -NetworksPath $standaloneNetworksPath `
      -EnvFilePath $verifierEnvPath `
      -Role "verifier" `
      -StateDir $verifierStateRoot
  }

  Invoke-Step -Label "Confirming final balances" -Script {
    $providerBalance = Get-ContractUint `
      -NodeWorkingDirectory $repoRoot `
      -RpcUrl $rpcUrl `
      -ContractAddress $deploymentManifest.contractAddresses.token `
      -AbiSignature "function balanceOf(address owner) view returns (uint256)" `
      -MethodName "balanceOf" `
      -Arguments @($providerAddress)
    $verifierBalance = Get-ContractUint `
      -NodeWorkingDirectory $repoRoot `
      -RpcUrl $rpcUrl `
      -ContractAddress $deploymentManifest.contractAddresses.token `
      -AbiSignature "function balanceOf(address owner) view returns (uint256)" `
      -MethodName "balanceOf" `
      -Arguments @($verifierAddress)
    $expectedProviderBalance = [bigint]"660000000000000000000"
    $expectedVerifierBalance = [bigint]"340000000000000000000"

    if ($providerBalance -ne $expectedProviderBalance) {
      throw "Provider KOIN balance mismatch. Expected $expectedProviderBalance, got $providerBalance"
    }
    if ($verifierBalance -ne $expectedVerifierBalance) {
      throw "Verifier KOIN balance mismatch. Expected $expectedVerifierBalance, got $verifierBalance"
    }

    Write-Host "Local v2 manifest: $worldlandManifestPath"
    Write-Host "Shared network root: $sharedNetworkRoot"
    Write-Host "Provider state root: $providerStateRoot"
    Write-Host "Verifier state root: $verifierStateRoot"
    Write-Host "Provider address: $providerAddress"
    Write-Host "Verifier address: $verifierAddress"
    Write-Host "Provider KOIN: $providerBalance"
    Write-Host "Verifier KOIN: $verifierBalance"
    Write-Host "Provider model: $ollamaModelToUse"
  }
} finally {
  if ($anvilProcess -and -not $KeepAnvilRunning) {
    Write-Section "Stopping Anvil"
    Stop-Process -Id $anvilProcess.Id -Force -ErrorAction SilentlyContinue
  }
  if ($ollamaProcess) {
    Write-Section "Stopping Ollama"
    Stop-Process -Id $ollamaProcess.Id -Force -ErrorAction SilentlyContinue
  }
}
