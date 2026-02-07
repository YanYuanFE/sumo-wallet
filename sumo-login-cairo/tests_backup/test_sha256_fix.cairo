// Test to verify SHA256 -> u256 conversion fix
// Using real frontend data to validate the fix

use core::sha256::compute_sha256_byte_array;

/// Converts SHA256 result [u32; 8] to u256 (big-endian)
fn sha256_to_u256(hash: @[u32; 8]) -> u256 {
    let [h0, h1, h2, h3, h4, h5, h6, h7] = *hash;
    let high: u128 = h0.into() * 0x100000000_u128 * 0x100000000_u128 * 0x100000000_u128
        + h1.into() * 0x100000000_u128 * 0x100000000_u128
        + h2.into() * 0x100000000_u128
        + h3.into();
    let low: u128 = h4.into() * 0x100000000_u128 * 0x100000000_u128 * 0x100000000_u128
        + h5.into() * 0x100000000_u128 * 0x100000000_u128
        + h6.into() * 0x100000000_u128
        + h7.into();
    u256 { low, high }
}

fn concatenate_inputs(inputs: Span<u256>) -> ByteArray {
    let mut byte_array = Default::default();
    let mut index = 0_u32;
    while index < inputs.len() {
        let int_value: u256 = *inputs.at(index);
        byte_array.append_word(int_value.high.into(), 16);
        byte_array.append_word(int_value.low.into(), 16);
        index += 1;
    };
    byte_array
}

#[test]
fn test_sha256_to_u256_with_frontend_data() {
    // Frontend test data
    let eph_key0 = u256 {
        high: 0_u128,
        low: 10181066411583890409153745626179173434_u128
    };
    let eph_key1 = u256 {
        high: 0_u128,
        low: 67401073732219800429913801379486268102_u128
    };
    let address_seed = u256 {
        high: 4532165749145010398064547535942470854_u128,
        low: 189745190993220729260705701732965092773_u128
    };
    let max_epoch = u256 {
        high: 0_u128,
        low: 6152415_u128
    };
    let iss_b64_F = u256 {
        high: 138844379665950632630512019909309789299_u128,
        low: 61681554556335259632919281556340604928_u128
    };
    let iss_index = u256 {
        high: 0_u128,
        low: 0_u128
    };
    let header_F = u256 {
        high: 163673557557026276278960773030236793890_u128,
        low: 142774617671841545453573617513109021750_u128
    };
    let modulus_F = u256 {
        high: 19020446449723790685639019486572559011_u128,
        low: 199551597212417787828927877268002290167_u128
    };

    // Expected AIH from frontend ZK circuit
    let expected_high: u128 = 251640812171688988419670284486913126462_u128;
    let expected_low: u128 = 151073648476635287729659305324865142467_u128;
    let expected_aih = u256 { high: expected_high, low: expected_low };

    // Build inputs array (same order as in validate_all_inputs_hash)
    let inputs: Array<u256> = array![
        eph_key0,
        eph_key1,
        address_seed,
        max_epoch,
        iss_b64_F,
        iss_index,
        header_F,
        modulus_F
    ];

    // Compute SHA256
    let sha256_input = concatenate_inputs(inputs.span());
    let hash_result = compute_sha256_byte_array(@sha256_input);

    // Convert using the fixed function
    let computed_aih = sha256_to_u256(@hash_result);

    // Verify the result matches frontend
    assert(computed_aih.high == expected_aih.high, 'AIH high mismatch');
    assert(computed_aih.low == expected_aih.low, 'AIH low mismatch');
}

#[test]
fn test_old_buggy_conversion_fails() {
    // This test demonstrates that the old buggy conversion would NOT match
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
    assert(buggy_aih.high != expected_high || buggy_aih.low != expected_low, 'Bug would match - unexpected');
}
