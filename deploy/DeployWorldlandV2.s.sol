// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {InferenceJobRegistry} from "../vendor/koinara/contracts/InferenceJobRegistry.sol";
import {KOINToken} from "../vendor/koinara/contracts/KOINToken.sol";
import {NodeRegistryV2} from "../vendor/koinara/contracts/NodeRegistryV2.sol";
import {ProofOfInferenceVerifier} from "../vendor/koinara/contracts/ProofOfInferenceVerifier.sol";
import {RewardDistributorV2} from "../vendor/koinara/contracts/RewardDistributorV2.sol";
import {ScriptBase} from "../vendor/koinara/script/helpers/ScriptBase.sol";

contract DeployWorldlandV2 is ScriptBase {
    function run()
        external
        returns (
            InferenceJobRegistry registry,
            ProofOfInferenceVerifier verifier,
            KOINToken token,
            NodeRegistryV2 nodeRegistry,
            RewardDistributorV2 distributor
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
        nodeRegistry = new NodeRegistryV2(deployer, genesisTimestamp, epochDuration);
        distributor = new RewardDistributorV2(
            address(token),
            address(registry),
            address(verifier),
            address(nodeRegistry),
            genesisTimestamp,
            epochDuration,
            halvingInterval,
            initialEpochEmission,
            2_000
        );

        registry.setVerifier(address(verifier));
        registry.setRewardDistributor(address(distributor));
        token.setMinter(address(distributor));
        nodeRegistry.setRewardDistributor(address(distributor));
        registry.renounceAdmin();
        token.renounceAdmin();
        nodeRegistry.renounceAdmin();

        vm.stopBroadcast();
    }
}
