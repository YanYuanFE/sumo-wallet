use core::sha256::compute_sha256_byte_array;
use core::hash::{HashStateTrait, HashStateExTrait};
use core::pedersen::PedersenTrait;

// ============ Constants ============
const MASK_250: u256 = 1809251394333065553493296640760748560207343510400633813116524750123642650623;

// ============ SHA256 Functions ============

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

// ============ Account Address Computation ============

#[derive(Drop, Hash, Serde, Copy)]
struct StructForHash {
    prefix: felt252,
    deployer_address: felt252,
    salt: felt252,
    class_hash: felt252,
    constructor_calldata_hash: felt252,
}

fn mask_address_seed(address_seed: u256) -> felt252 {
    let masked: felt252 = (address_seed & MASK_250).try_into().unwrap();
    masked
}

fn precompute_account_address(
    deployer_address: felt252,
    class_hash: felt252,
    address_seed: u256
) -> felt252 {
    let salt: felt252 = mask_address_seed(address_seed);
    // Pedersen hash of empty array
    let hash_zero_array: felt252 = 2089986280348253421170679821480865132823066470938446095505822317253594081284;

    let struct_to_hash = StructForHash {
        prefix: 'STARKNET_CONTRACT_ADDRESS',
        deployer_address: deployer_address,
        salt: salt,
        class_hash: class_hash,
        constructor_calldata_hash: hash_zero_array,
    };

    let hash = PedersenTrait::new(0)
        .update_with(struct_to_hash)
        .update_with(5)
        .finalize();
    hash
}

// ============ Tests ============

#[cfg(test)]
mod tests {
    use super::{
        sha256_to_u256, concatenate_inputs, mask_address_seed,
        precompute_account_address, MASK_250
    };
    use core::sha256::compute_sha256_byte_array;

    // ---------- SHA256 Tests ----------

    #[test]
    fn test_sha256_to_u256_with_frontend_data() {
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
        let computed_aih = sha256_to_u256(@hash_result);

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
        let buggy_aih: u256 = (*hash_result.span().at(0)).into();

        let matches = buggy_aih.high == expected_high && buggy_aih.low == expected_low;
        assert(!matches, 'Bug unexpectedly matches');
    }

    // ---------- Account Address Tests ----------

    #[test]
    fn test_mask_address_seed() {
        // Test with the real address_seed from frontend
        let address_seed = u256 {
            high: 4532165749145010398064547535942470854,
            low: 189745190993220729260705701732965092773
        };

        let masked = mask_address_seed(address_seed);

        // Verify masked value fits in felt252 (< 2^251)
        // The mask ensures the top 6 bits are cleared
        let masked_u256: u256 = masked.into();
        assert(masked_u256 <= MASK_250, 'Masked exceeds 250 bits');

        // Verify masking is idempotent
        let double_masked = mask_address_seed(masked_u256);
        assert(masked == double_masked, 'Masking not idempotent');
    }

    #[test]
    fn test_mask_address_seed_large_value() {
        // Test with a value that exceeds 250 bits
        let large_seed = u256 {
            high: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF_u128,
            low: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF_u128
        };

        let masked = mask_address_seed(large_seed);
        let masked_u256: u256 = masked.into();

        // Should be truncated to 250 bits
        assert(masked_u256 <= MASK_250, 'Large value not masked');
    }

    #[test]
    fn test_precompute_account_address_deterministic() {
        // Use mock values for testing
        let deployer: felt252 = 0x1234567890abcdef;
        let class_hash: felt252 = 0xfedcba0987654321;
        let address_seed = u256 {
            high: 4532165749145010398064547535942470854,
            low: 189745190993220729260705701732965092773
        };

        // Compute address twice
        let addr1 = precompute_account_address(deployer, class_hash, address_seed);
        let addr2 = precompute_account_address(deployer, class_hash, address_seed);

        // Should be deterministic
        assert(addr1 == addr2, 'Address not deterministic');
        assert(addr1 != 0, 'Address should not be zero');
    }

    #[test]
    fn test_precompute_address_different_seeds() {
        let deployer: felt252 = 0x1234567890abcdef;
        let class_hash: felt252 = 0xfedcba0987654321;

        let seed1 = u256 { high: 100, low: 200 };
        let seed2 = u256 { high: 100, low: 201 };

        let addr1 = precompute_account_address(deployer, class_hash, seed1);
        let addr2 = precompute_account_address(deployer, class_hash, seed2);

        // Different seeds should produce different addresses
        assert(addr1 != addr2, 'Different seeds same address');
    }

    #[test]
    fn test_precompute_address_different_deployers() {
        let class_hash: felt252 = 0xfedcba0987654321;
        let address_seed = u256 { high: 100, low: 200 };

        let deployer1: felt252 = 0x1111111111111111;
        let deployer2: felt252 = 0x2222222222222222;

        let addr1 = precompute_account_address(deployer1, class_hash, address_seed);
        let addr2 = precompute_account_address(deployer2, class_hash, address_seed);

        // Different deployers should produce different addresses
        assert(addr1 != addr2, 'Different deployers same addr');
    }

    #[test]
    fn test_precompute_address_different_class_hash() {
        let deployer: felt252 = 0x1234567890abcdef;
        let address_seed = u256 { high: 100, low: 200 };

        let class_hash1: felt252 = 0xaaaaaaaaaaaaaaaa;
        let class_hash2: felt252 = 0xbbbbbbbbbbbbbbbb;

        let addr1 = precompute_account_address(deployer, class_hash1, address_seed);
        let addr2 = precompute_account_address(deployer, class_hash2, address_seed);

        // Different class hashes should produce different addresses
        assert(addr1 != addr2, 'Different class same addr');
    }
}
