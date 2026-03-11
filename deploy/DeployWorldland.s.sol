// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {InferenceJobRegistry} from "../vendor/koinara/contracts/InferenceJobRegistry.sol";
import {KOINToken} from "../vendor/koinara/contracts/KOINToken.sol";
import {ProofOfInferenceVerifier} from "../vendor/koinara/contracts/ProofOfInferenceVerifier.sol";
import {RewardDistributor} from "../vendor/koinara/contracts/RewardDistributor.sol";
import {ScriptBase} from "../vendor/koinara/script/helpers/ScriptBase.sol";

contract DeployWorldland is ScriptBase {
    function run()
        external
        returns (
            InferenceJobRegistry registry,
            ProofOfInferenceVerifier verifier,
            KOINToken token,
            RewardDistributor distributor
        )
    {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        uint256 epochDuration = vm.envUint("EPOCH_DURATION");
        uint256 halvingInterval = vm.envUint("HALVING_INTERVAL");
        uint256 initialEpochEmission = vm.envUint("INITIAL_EPOCH_EMISSION");
        uint256 genesisTimestamp = vm.envUint("GENESIS_TIMESTAMP");

        if (genesisTimestamp == 0) {
            genesisTimestamp = block.timestamp;
        }

        vm.startBroadcast(deployerPrivateKey);

        registry = new InferenceJobRegistry(deployer);
        verifier = new ProofOfInferenceVerifier(address(registry));
        token = new KOINToken(deployer);
        distributor = new RewardDistributor(
            address(token),
            address(registry),
            address(verifier),
            genesisTimestamp,
            epochDuration,
            halvingInterval,
            initialEpochEmission
        );

        registry.setVerifier(address(verifier));
        registry.setRewardDistributor(address(distributor));
        token.setMinter(address(distributor));
        registry.renounceAdmin();
        token.renounceAdmin();

        vm.stopBroadcast();
    }
}
