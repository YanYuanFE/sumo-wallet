use snforge_std::{
    declare,
    ContractClassTrait,
    DeclareResultTrait,
    start_cheat_signature,
    stop_cheat_signature,
};
use starknet::ContractAddress;
use sumo::login::login_contract::{ILoginDispatcher, ILoginDispatcherTrait};
use sumo::utils::utils::precompute_account_address;

// Constants from sumo::utils::constants
const ORACLE_ADDRESS: felt252 = 0x0084b8a600e0076a6fda30ce9ba4d93ba8e152239b88308cac3f80bbbc4ca3cc;
const ADMIN_PUBLIC_KEY: felt252 = 0x1234567890abcdef;

// Helper to create a mock signature array for testing deploy
fn create_mock_signature(address_seed: u256, eph_key: (felt252, felt252), max_block: felt252) -> Array<felt252> {
    let mut sig: Array<felt252> = array![];

    // signature_type: selector!("signature/user")
    sig.append(selector!("signature/user"));
    // r, s (mock ECDSA signature - not validated in direct deploy call)
    sig.append(0x123);  // r
    sig.append(0x456);  // s
    // eph_key tuple
    let (eph_key_0, eph_key_1) = eph_key;
    sig.append(eph_key_0);
    sig.append(eph_key_1);
    // address_seed (u256 = high, low)
    sig.append(address_seed.low.into());
    sig.append(address_seed.high.into());
    // max_block
    sig.append(max_block);
    // iss_b64_F (u256)
    sig.append(0);
    sig.append(0);
    // iss_index_in_payload_mod_4
    sig.append(0);
    // header_F (u256)
    sig.append(0);
    sig.append(0);
    // modulus_F (u256)
    sig.append(0);
    sig.append(0);
    // garaga span length + empty data
    sig.append(0);  // empty span

    sig
}

fn deploy_oracle() -> ContractAddress {
    let oracle_class = declare("OracleContract").unwrap().contract_class();
    let oracle_address: ContractAddress = ORACLE_ADDRESS.try_into().unwrap();
    oracle_class.deploy_at(@array![], oracle_address).unwrap();
    oracle_address
}

fn setup_login_contract() -> (ContractAddress, felt252) {
    // Deploy Oracle first
    deploy_oracle();

    // Declare contracts
    let login_class = declare("Login").unwrap().contract_class();
    let account_class = declare("Account").unwrap().contract_class();
    let account_class_hash: felt252 = (*account_class.class_hash).into();

    // Deploy Login contract
    let constructor_args = array![account_class_hash, ADMIN_PUBLIC_KEY];
    let (login_address, _) = login_class.deploy(@constructor_args).unwrap();

    (login_address, account_class_hash)
}

#[test]
fn test_login_contract_deployment() {
    let (login_address, _) = setup_login_contract();
    let dispatcher = ILoginDispatcher { contract_address: login_address };

    // Test: new user should not exist
    let test_user: ContractAddress = 0x999.try_into().unwrap();
    let is_user = dispatcher.is_sumo_user(test_user);
    assert(!is_user, 'User should not exist');
}

#[test]
fn test_precompute_address_matches_deploy_target() {
    let (login_address, account_class_hash) = setup_login_contract();

    // Use frontend test data
    let address_seed = u256 {
        high: 4532165749145010398064547535942470854,
        low: 189745190993220729260705701732965092773
    };

    // Compute expected address
    let expected_address = precompute_account_address(
        login_address,
        account_class_hash,
        address_seed
    );

    // Verify address is valid (non-zero)
    let addr_felt: felt252 = expected_address.into();
    assert(addr_felt != 0, 'Address should not be zero');
}

#[test]
fn test_user_debt_initial_zero() {
    let (login_address, _) = setup_login_contract();
    let dispatcher = ILoginDispatcher { contract_address: login_address };

    let test_user: ContractAddress = 0x999.try_into().unwrap();
    let debt = dispatcher.get_user_debt(test_user);
    assert(debt == 0, 'Initial debt should be zero');
}

#[test]
fn test_deploy_creates_user_account() {
    let (login_address, account_class_hash) = setup_login_contract();
    let dispatcher = ILoginDispatcher { contract_address: login_address };

    // Test address seed
    let address_seed = u256 {
        high: 4532165749145010398064547535942470854,
        low: 189745190993220729260705701732965092773
    };

    // Compute expected address before deploy
    let expected_address = precompute_account_address(
        login_address,
        account_class_hash,
        address_seed
    );

    // Verify user doesn't exist yet
    assert(!dispatcher.is_sumo_user(expected_address), 'User should not exist yet');

    // Create mock signature
    let eph_key: (felt252, felt252) = (0x1, 0x2);
    let max_block: felt252 = 1000000;
    let mock_sig = create_mock_signature(address_seed, eph_key, max_block);

    // Mock the transaction signature
    start_cheat_signature(login_address, mock_sig.span());

    // Call deploy
    let deployed_address = dispatcher.deploy();

    // Stop cheating
    stop_cheat_signature(login_address);

    // Verify the deployed address matches expected
    assert(deployed_address == expected_address, 'Address mismatch');

    // Verify user now exists
    assert(dispatcher.is_sumo_user(deployed_address), 'User should exist');

    // Verify debt was added
    let debt = dispatcher.get_user_debt(deployed_address);
    assert(debt > 0, 'Debt should be added');
}
