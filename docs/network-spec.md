# Koinara-Worldland Network Spec

`koinara@v0.1.6` stores only `requestHash`, `schemaHash`, and `responseHash` on-chain.
Public nodes therefore need an off-chain companion format to discover request payloads and provider outputs.

## 1. Job Manifest

Nodes discover jobs by looking up:

- `jobs/<requestHash>.json`

Each job manifest has this shape:

```json
{
  "version": "koinara-job-manifest-v1",
  "requestHash": "0x...",
  "body": {
    "prompt": "Summarize this article.",
    "contentType": "text/plain",
    "schema": {
      "type": "text"
    },
    "metadata": {
      "createdBy": "wallet or app label"
    }
  }
}
```

`requestHash` must equal:

```text
keccak256(utf8(canonical_json(body)))
```

`schemaHash` on-chain is derived separately as:

```text
keccak256(utf8(canonical_json(body.schema)))
```

## 2. Submission Receipt

Nodes discover provider outputs by looking up:

- `receipts/<jobId>-<responseHash>.json`

Each receipt has this shape:

```json
{
  "version": "koinara-submission-receipt-v1",
  "jobId": 1,
  "responseHash": "0x...",
  "provider": "0x...",
  "body": {
    "contentType": "application/json",
    "output": {
      "text": "Example result"
    },
    "metadata": {
      "backend": "ollama"
    }
  }
}
```

`responseHash` must equal:

```text
keccak256(utf8(canonical_json(body)))
```

`provider` must match the provider address recorded in the on-chain submission.

## 3. Discovery Roots

The node program accepts multiple discovery roots.
Each root can be:

- a local filesystem path
- an HTTP base URL

The same path convention is used for both:

- `<root>/jobs/<requestHash>.json`
- `<root>/receipts/<jobId>-<responseHash>.json`

## 4. Shared Storage Model

This repository intentionally avoids a hosted gateway or database.
For multi-machine operation, operators should use one of these patterns:

- a shared filesystem path
- a synced folder
- a static HTTP host that mirrors the same directory structure

The node program only assumes the hash-addressed file layout described above.
