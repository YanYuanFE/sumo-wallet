// Test utils functions with real frontend data
// This test verifies the SHA256 fix and account address computation

use sumo::utils::utils::{
    validate_all_inputs_hash,
    mask_address_seed,
    precompute_account_address,
    sha256_to_u256,
    concatenate_inputs
};
use sumo::utils::structs::Signature;
use sumo::utils::constants::MASK_250;
use core::sha256::compute_sha256_byte_array;
use core::starknet::contract_address_const;

// ============ SHA256 Tests ============

#[test]
fn test_sha256_to_u256_with_frontend_data() {
    // Frontend test data
    let eph_key0 = u256 { high: 0, low: 10181066411583890409153745626179173434 };
    let eph_key1 = u256 { high: 0, low: 67401073732219800429913801379486268102 };
    let address_seed = u256 {
        high: 4532165749145010398064547535942470854,
        low: 189745190993220729260705701732965092773
    };
    let max_epoch = u256 { high: 0, low: 6152415 };
    let iss_b64_F = u256 {
        high: 138844379665950632630512019909309789299,
        low: 61681554556335259632919281556340604928
    };
    let iss_index = u256 { high: 0, low: 0 };
    let header_F = u256 {
        high: 163673557557026276278960773030236793890,
        low: 142774617671841545453573617513109021750
    };
    let modulus_F = u256 {
        high: 19020446449723790685639019486572559011,
        low: 199551597212417787828927877268002290167
    };

    // Expected AIH from frontend ZK circuit
    let expected_high: u128 = 251640812171688988419670284486913126462;
    let expected_low: u128 = 151073648476635287729659305324865142467;

    // Build inputs array
    let inputs: Array<u256> = array![
        eph_key0, eph_key1, address_seed, max_epoch,
        iss_b64_F, iss_index, header_F, modulus_F
    ];

    // Compute SHA256
    let sha256_input = concatenate_inputs(inputs.span());
    let hash_result = compute_sha256_byte_array(@sha256_input);
    let computed_aih = sha256_to_u256(@hash_result);

    // Verify the result matches frontend
    assert(computed_aih.high == expected_high, 'AIH high mismatch');
    assert(computed_aih.low == expected_low, 'AIH low mismatch');
}

#[test]
fn test_old_buggy_conversion_differs() {
    let eph_key0 = u256 { high: 0, low: 10181066411583890409153745626179173434 };
    let eph_key1 = u256 { high: 0, low: 67401073732219800429913801379486268102 };
    let address_seed = u256 {
        high: 4532165749145010398064547535942470854,
        low: 189745190993220729260705701732965092773
    };
    let max_epoch = u256 { high: 0, low: 6152415 };
    let iss_b64_F = u256 {
        high: 138844379665950632630512019909309789299,
        low: 61681554556335259632919281556340604928
    };
    let iss_index = u256 { high: 0, low: 0 };
    let header_F = u256 {
        high: 163673557557026276278960773030236793890,
        low: 142774617671841545453573617513109021750
    };
    let modulus_F = u256 {
        high: 19020446449723790685639019486572559011,
        low: 199551597212417787828927877268002290167
    };

    let expected_high: u128 = 251640812171688988419670284486913126462;
    let expected_low: u128 = 151073648476635287729659305324865142467;

    let inputs: Array<u256> = array![
        eph_key0, eph_key1, address_seed, max_epoch,
        iss_b64_F, iss_index, header_F, modulus_F
    ];

    let sha256_input = concatenate_inputs(inputs.span());
    let hash_result = compute_sha256_byte_array(@sha256_input);

    // Old buggy conversion - only takes first u32
    let buggy_aih: u256 = (*hash_result.span().at(0)).into();

    // This should NOT match the expected value
    let matches = buggy_aih.high == expected_high && buggy_aih.low == expected_low;
    assert(!matches, 'Bug unexpectedly matches');
}

// ============ validate_all_inputs_hash Tests ============

#[test]
fn test_validate_all_inputs_hash_with_frontend_data() {
    // Create signature with frontend data
    let signature = Signature {
        signature_type: 0x02ef13d65857314dae3292970fab8340551268d1201f2671f6065f1990558e95,
        r: 0x29428021f4ffa4ece767fffbf194bb16ae8b75dc22454c3cdfcb5f42eb6b5af,
        s: 0x43b37805434b0fa36d5573f2aa17232ec307ba943793732e3fcea1cbd79f3c1,
        eph_key: (
            10181066411583890409153745626179173434,  // eph_key0 low (high=0)
            67401073732219800429913801379486268102   // eph_key1 low (high=0)
        ),
        address_seed: u256 {
            high: 4532165749145010398064547535942470854,
            low: 189745190993220729260705701732965092773
        },
        max_block: 6152415,
        iss_b64_F: u256 {
            high: 138844379665950632630512019909309789299,
            low: 61681554556335259632919281556340604928
        },
        iss_index_in_payload_mod_4: 0,
        header_F: u256 {
            high: 163673557557026276278960773030236793890,
            low: 142774617671841545453573617513109021750
        },
        modulus_F: u256 {
            high: 19020446449723790685639019486572559011,
            low: 199551597212417787828927877268002290167
        },
        garaga: array![].span()
    };

    // Expected AIH from frontend ZK circuit (as u256 values)
    let expected_high: u256 = 251640812171688988419670284486913126462;
    let expected_low: u256 = 151073648476635287729659305324865142467;
    let all_inputs_hash: Array<u256> = array![expected_high, expected_low];

    // Validate
    let result = validate_all_inputs_hash(@signature, all_inputs_hash.span());
    assert(result, 'AIH validation failed');
}

// ============ Account Address Tests ============

#[test]
fn test_mask_address_seed() {
    let address_seed = u256 {
        high: 4532165749145010398064547535942470854,
        low: 189745190993220729260705701732965092773
    };

    let masked = mask_address_seed(address_seed);
    let masked_u256: u256 = masked.into();

    assert(masked_u256 <= MASK_250, 'Masked exceeds 250 bits');
}

#[test]
fn test_mask_address_seed_large_value() {
    let large_seed = u256 {
        high: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF_u128,
        low: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF_u128
    };

    let masked = mask_address_seed(large_seed);
    let masked_u256: u256 = masked.into();

    assert(masked_u256 <= MASK_250, 'Large value not masked');
}

#[test]
fn test_precompute_address_deterministic() {
    let deployer = contract_address_const::<0x1234567890abcdef>();
    let class_hash: felt252 = 0xfedcba0987654321;
    let address_seed = u256 {
        high: 4532165749145010398064547535942470854,
        low: 189745190993220729260705701732965092773
    };

    let addr1 = precompute_account_address(deployer, class_hash, address_seed);
    let addr2 = precompute_account_address(deployer, class_hash, address_seed);

    assert(addr1 == addr2, 'Address not deterministic');
}

#[test]
fn test_precompute_address_different_seeds() {
    let deployer = contract_address_const::<0x1234567890abcdef>();
    let class_hash: felt252 = 0xfedcba0987654321;

    let seed1 = u256 { high: 100, low: 200 };
    let seed2 = u256 { high: 100, low: 201 };

    let addr1 = precompute_account_address(deployer, class_hash, seed1);
    let addr2 = precompute_account_address(deployer, class_hash, seed2);

    assert(addr1 != addr2, 'Different seeds same address');
}
