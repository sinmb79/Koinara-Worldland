import {
  asRecord,
  jobStateNameFromValue,
  jobTypeNameFromValue,
  type KoinaraContracts
} from "../contracts.js";
import {
  computeRequestHash,
  computeResponseHash,
  computeSchemaHash,
  resolveJobManifest,
  resolveSubmissionReceipt
} from "../manifest.js";
import type { OnChainJob, OnChainSubmission, RuntimeConfig, VerificationRecord } from "../types.js";
import { FileStateStore } from "../state/fileStateStore.js";

export async function runVerifierPass(
  config: RuntimeConfig,
  contracts: KoinaraContracts,
  stateStore: FileStateStore
): Promise<void> {
  if (!config.verifier) {
    return;
  }

  const totalJobs = Number(await contracts.registry.totalJobs());

  for (let jobId = 1; jobId <= totalJobs; jobId += 1) {
    const job = (await contracts.registry.getJob(jobId)) as OnChainJob;
    const stateName = jobStateNameFromValue(job.state);

    if (stateName === "Open" && Number(job.deadline) < Math.floor(Date.now() / 1000)) {
      await tryMarkExpired(contracts, jobId);
      continue;
    }

    if (stateName === "Accepted") {
      const submission = (await contracts.registry.getSubmission(jobId)) as OnChainSubmission;
      await tryDistributeRewards(contracts, jobId, submission.provider);
      continue;
    }

    if (stateName !== "Submitted" && stateName !== "UnderVerification") {
      continue;
    }

    const jobTypeName = jobTypeNameFromValue(job.jobType);
    if (!config.verifier.supportedJobTypes.includes(jobTypeName)) {
      continue;
    }

    if (stateName === "Submitted") {
      await tryRegisterSubmission(contracts, jobId);
    }

    if (await contracts.verifier.hasParticipated(jobId, contracts.wallet.address)) {
      stateStore.markParticipated(jobId, "on-chain");
      await tryFinalizeAndSettle(contracts, jobId);
      continue;
    }

    const submission = (await contracts.registry.getSubmission(jobId)) as OnChainSubmission;
    if (!submission.exists) {
      continue;
    }

    const verdict = await evaluateSubmission(config, job, submission);
    try {
      if (verdict === null) {
        const tx = await contracts.verifier.verifySubmission(jobId);
        await tx.wait();
        stateStore.markParticipated(jobId, "verified");
        console.log(`verifier: approved job ${jobId}`);
      } else {
        const tx = await contracts.verifier.rejectSubmission(jobId, verdict);
        await tx.wait();
        stateStore.markParticipated(jobId, `rejected:${verdict}`);
        console.log(`verifier: rejected job ${jobId} (${verdict})`);
      }
    } catch (error) {
      console.warn(`verifier: participation failed for job ${jobId}: ${formatError(error)}`);
    }

    await tryFinalizeAndSettle(contracts, jobId);
  }
}

async function evaluateSubmission(
  config: RuntimeConfig,
  job: OnChainJob,
  submission: OnChainSubmission
): Promise<string | null> {
  const manifest = await resolveJobManifest(config.manifestRoots, job.requestHash);
  if (!manifest) {
    return "missing_job_manifest";
  }
  if (computeRequestHash(manifest).toLowerCase() !== String(job.requestHash).toLowerCase()) {
    return "request_hash_mismatch";
  }
  if (computeSchemaHash(manifest).toLowerCase() !== String(job.schemaHash).toLowerCase()) {
    return "schema_hash_mismatch";
  }
  if (!manifest.body.prompt.trim()) {
    return "empty_prompt";
  }

  if (
    config.verifier?.supportedSchemaHashes.length &&
    !config.verifier.supportedSchemaHashes
      .map((entry) => entry.toLowerCase())
      .includes(String(job.schemaHash).toLowerCase())
  ) {
    return "unsupported_schema";
  }

  const receipt = await resolveSubmissionReceipt(
    config.receiptRoots,
    Number(job.jobId),
    submission.responseHash
  );
  if (!receipt) {
    return "missing_submission_receipt";
  }
  if (receipt.provider.toLowerCase() !== submission.provider.toLowerCase()) {
    return "provider_mismatch";
  }
  if (computeResponseHash(receipt).toLowerCase() !== String(submission.responseHash).toLowerCase()) {
    return "response_hash_mismatch";
  }

  const outputText =
    typeof receipt.body.output === "string"
      ? receipt.body.output
      : JSON.stringify(receipt.body.output);
  if (!outputText || outputText === "null" || outputText === "{}") {
    return "empty_response";
  }

  return null;
}

async function tryRegisterSubmission(contracts: KoinaraContracts, jobId: number): Promise<void> {
  try {
    const tx = await contracts.verifier.registerSubmission(jobId);
    await tx.wait();
  } catch (error) {
    console.warn(`verifier: registerSubmission skipped for job ${jobId}: ${formatError(error)}`);
  }
}

async function tryMarkExpired(contracts: KoinaraContracts, jobId: number): Promise<void> {
  try {
    const tx = await contracts.registry.markExpired(jobId);
    await tx.wait();
    console.log(`verifier: marked job ${jobId} as expired`);
  } catch (error) {
    console.warn(`verifier: markExpired skipped for job ${jobId}: ${formatError(error)}`);
  }
}

async function tryFinalizeAndSettle(
  contracts: KoinaraContracts,
  jobId: number
): Promise<void> {
  try {
    const tx = await contracts.verifier.finalizePoI(jobId);
    await tx.wait();
    console.log(`verifier: finalized PoI for job ${jobId}`);
  } catch (error) {
    console.warn(`verifier: finalizePoI skipped for job ${jobId}: ${formatError(error)}`);
  }

  const record = asRecord((await contracts.verifier.getRecord(jobId)) as VerificationRecord);
  if (!record.finalized || record.rejected || record.poiHash === zeroHash()) {
    return;
  }

  await tryDistributeRewards(contracts, jobId, record.provider);
}

async function tryDistributeRewards(
  contracts: KoinaraContracts,
  jobId: number,
  provider: string
): Promise<void> {
  try {
    const tx = await contracts.rewardDistributor.distributeRewards(jobId, provider);
    await tx.wait();
    console.log(`verifier: distributed rewards for job ${jobId}`);
  } catch (error) {
    console.warn(`verifier: distributeRewards skipped for job ${jobId}: ${formatError(error)}`);
  }
}

function zeroHash(): string {
  return `0x${"0".repeat(64)}`;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
