use core::sha256::{ compute_sha256_byte_array };
use core::starknet::{ syscalls , SyscallResultTrait , ContractAddress };
use crate::utils::structs::{ Signature, StructForHash, StructForHashImpl };
use crate::utils::constants::{ STRK_ADDRESS, MASK_250, ORACLE_ADDRESS };


/// Verifies that the SHA256 hash of the public inputs matches the one from ZK proof.
/// Garaga returns 2 public inputs: [hash_high, hash_low] which form a u256.
pub fn validate_all_inputs_hash(signature : @Signature, all_inputs_hash: Span<u256>) -> bool {
    let (eph_0, eph_1) = *signature.eph_key;

    // Build array of public inputs from signature
    let inputs: Array<u256> = array![
        eph_0.into(),
        eph_1.into(),
        (*signature.address_seed),
        (*signature.max_block).into(),
        (*signature.iss_b64_F),
        (*signature.iss_index_in_payload_mod_4).into(),
        (*signature.header_F),
        (*signature.modulus_F)
    ];

    // Compute SHA256 hash of inputs
    let sha256_input = concatenate_inputs(inputs.span());
    let hash_result = compute_sha256_byte_array(@sha256_input);

    // Reconstruct u256 from Garaga's 2 public inputs (high, low)
    let hash_high: u128 = (*all_inputs_hash.at(0)).try_into().unwrap();
    let hash_low: u128 = (*all_inputs_hash.at(1)).try_into().unwrap();
    let zk_hash = u256 { low: hash_low, high: hash_high };

    // Convert SHA256 result [u32; 8] to u256 (big-endian)
    let computed_hash: u256 = sha256_to_u256(@hash_result);

    zk_hash == computed_hash
}

pub fn concatenate_inputs(inputs: Span<u256>) -> ByteArray {
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

/// Converts SHA256 result [u32; 8] to u256 (big-endian)
pub fn sha256_to_u256(hash: @[u32; 8]) -> u256 {
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


pub fn mask_address_seed(address_seed: u256 ) -> felt252 {
    let masked_address_seed: felt252 = (address_seed & MASK_250).try_into().unwrap();
    return masked_address_seed;
}


/// Precoputed the address that a deployed account will have given the deployer, the class_hash and the address
/// seed.
pub fn precompute_account_address( deployer_address: ContractAddress, class_hash:felt252, address_seed:u256)
    -> ContractAddress {
        let salt: felt252 = mask_address_seed(address_seed);
        let hash_zero_array: felt252 = 2089986280348253421170679821480865132823066470938446095505822317253594081284;
        let struct_to_hash = StructForHash {
            prefix: 'STARKNET_CONTRACT_ADDRESS',
            deployer_address: deployer_address.try_into().unwrap(),
            salt: salt,
            class_hash: class_hash,
            constructor_calldata_hash: hash_zero_array,
        };
        let hash = struct_to_hash.hash();
        hash.try_into().unwrap()
    }


/// Verifies if the given user has enought STARK to pays his/her debt.
pub fn user_can_repay(user_addres: ContractAddress, debt: u128) -> bool {
    let response = syscalls::call_contract_syscall(
       STRK_ADDRESS.try_into().unwrap(),
       selector!("balance_of"),
       array![user_addres.into()].span(),
    ).unwrap_syscall();

    let low: u128 = (*response[0]).try_into().unwrap();
    let high: u128 = (*response[1]).try_into().unwrap();
    let balance = u256{ low , high }; 

    if balance < 2*debt.into() { return false ;} 
    return true;
}

/// Calls to the mock oracle to get the new modulus_F.
pub fn oracle_check()  -> u256 {
    let response = syscalls::call_contract_syscall(
        ORACLE_ADDRESS.try_into().unwrap(),
        selector!("get_modulus_F"),
        array![].span(),
    ) .unwrap_syscall();
    let low: u128 = (*response[0]).try_into().unwrap();
    let high: u128 = (*response[1]).try_into().unwrap();
    let modulus_F= u256{ low , high }; 
    return modulus_F;
}


/// Call for the Oracle to get the gas price in starks
pub fn get_gas_price() -> u128 {
    return 1000_u128;
}

// ============ Unit Tests ============
#[cfg(test)]
mod tests {
    use super::{sha256_to_u256, concatenate_inputs, mask_address_seed, precompute_account_address, validate_all_inputs_hash};
    use crate::utils::constants::MASK_250;
    use crate::utils::structs::Signature;
    use core::sha256::compute_sha256_byte_array;
    use core::starknet::contract_address_const;

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
        let inputs: Array<u256> = array![
            u256 { high: 0, low: 10181066411583890409153745626179173434 },
            u256 { high: 0, low: 67401073732219800429913801379486268102 },
            u256 { high: 4532165749145010398064547535942470854, low: 189745190993220729260705701732965092773 },
            u256 { high: 0, low: 6152415 },
            u256 { high: 138844379665950632630512019909309789299, low: 61681554556335259632919281556340604928 },
            u256 { high: 0, low: 0 },
            u256 { high: 163673557557026276278960773030236793890, low: 142774617671841545453573617513109021750 },
            u256 { high: 19020446449723790685639019486572559011, low: 199551597212417787828927877268002290167 }
        ];

        let sha256_input = concatenate_inputs(inputs.span());
        let hash_result = compute_sha256_byte_array(@sha256_input);
        let buggy_aih: u256 = (*hash_result.span().at(0)).into();

        let expected_high: u128 = 251640812171688988419670284486913126462;
        let expected_low: u128 = 151073648476635287729659305324865142467;
        let matches = buggy_aih.high == expected_high && buggy_aih.low == expected_low;
        assert(!matches, 'Bug unexpectedly matches');
    }

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
    fn test_precompute_address_deterministic() {
        let deployer = contract_address_const::<0x1234567890abcdef>();
        let class_hash: felt252 = 0xfedcba0987654321;
        let address_seed = u256 { high: 100, low: 200 };

        let addr1 = precompute_account_address(deployer, class_hash, address_seed);
        let addr2 = precompute_account_address(deployer, class_hash, address_seed);
        assert(addr1 == addr2, 'Address not deterministic');
    }

    #[test]
    fn test_precompute_address_different_seeds() {
        let deployer = contract_address_const::<0x1234567890abcdef>();
        let class_hash: felt252 = 0xfedcba0987654321;

        let addr1 = precompute_account_address(deployer, class_hash, u256 { high: 100, low: 200 });
        let addr2 = precompute_account_address(deployer, class_hash, u256 { high: 100, low: 201 });
        assert(addr1 != addr2, 'Different seeds same address');
    }

    /// Test validate_all_inputs_hash with frontend data
    /// This tests the critical deploy/login validation flow
    #[test]
    fn test_validate_all_inputs_hash_with_frontend_data() {
        // Frontend test data
        let eph_key0: felt252 = 10181066411583890409153745626179173434;
        let eph_key1: felt252 = 67401073732219800429913801379486268102;
        let address_seed = u256 {
            high: 4532165749145010398064547535942470854,
            low: 189745190993220729260705701732965092773
        };
        let max_block: felt252 = 6152415;
        let iss_b64_F = u256 {
            high: 138844379665950632630512019909309789299,
            low: 61681554556335259632919281556340604928
        };
        let iss_index: felt252 = 0;
        let header_F = u256 {
            high: 163673557557026276278960773030236793890,
            low: 142774617671841545453573617513109021750
        };
        let modulus_F = u256 {
            high: 19020446449723790685639019486572559011,
            low: 199551597212417787828927877268002290167
        };

        // Create mock signature
        let signature = Signature {
            signature_type: 0,
            r: 0,
            s: 0,
            eph_key: (eph_key0, eph_key1),
            address_seed: address_seed,
            max_block: max_block,
            iss_b64_F: iss_b64_F,
            iss_index_in_payload_mod_4: iss_index,
            header_F: header_F,
            modulus_F: modulus_F,
            garaga: array![].span()
        };

        // Expected AIH from ZK circuit (Garaga returns [high, low])
        let expected_high: u128 = 251640812171688988419670284486913126462;
        let expected_low: u128 = 151073648476635287729659305324865142467;
        let all_inputs_hash: Array<u256> = array![
            expected_high.into(),  // high
            expected_low.into()    // low
        ];

        // Validate - this should return true with the fix
        let result = validate_all_inputs_hash(@signature, all_inputs_hash.span());
        assert(result, 'validate_all_inputs_hash failed');
    }
}
