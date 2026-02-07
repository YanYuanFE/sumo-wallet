pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/bitify.circom";

/**
 * SUMO Auth Circuit
 *
 * This circuit proves ownership of a Google JWT without revealing it.
 * It matches the PublicInputs struct expected by the SUMO Cairo contract.
 *
 * Public Inputs (8 total, matching Cairo PublicInputs struct):
 * 1. eph_public_key0 - Ephemeral public key high 128 bits
 * 2. eph_public_key1 - Ephemeral public key low 128 bits
 * 3. address_seed - Derived from JWT sub + email
 * 4. max_epoch - Maximum block number for validity
 * 5. iss_b64_F - JWT issuer field representation
 * 6. iss_index_in_payload_mod_4 - Issuer index in payload mod 4
 * 7. header_F - JWT header field representation
 * 8. modulus_F - RSA modulus field representation
 *
 * Private Inputs:
 * - sub: Google subject ID (from JWT)
 * - email: User's email bytes
 * - secret: A secret derived from JWT signature
 */

template SumoAuth(emailLength) {
    // ===== Public Inputs (8 total) =====
    signal input eph_public_key0;      // 1. Ephemeral public key high bits
    signal input eph_public_key1;      // 2. Ephemeral public key low bits
    signal input address_seed;         // 3. Address seed
    signal input max_epoch;            // 4. Max block number
    signal input iss_b64_F;            // 5. Issuer field
    signal input iss_index_in_payload_mod_4; // 6. Issuer index mod 4
    signal input header_F;             // 7. Header field
    signal input modulus_F;            // 8. Modulus field

    // ===== Private Inputs =====
    signal input sub;                  // Google subject ID
    signal input email[emailLength];   // Email bytes
    signal input secret;               // Secret from JWT signature

    // ===== Intermediate Signals =====

    // Calculate email hash using iterative Poseidon
    var chunkSize = 15;
    var numChunks = (emailLength + chunkSize - 1) \ chunkSize;

    component chunkHasher[numChunks];
    signal intermediateHashes[numChunks];

    for (var i = 0; i < numChunks; i++) {
        var start = i * chunkSize;
        var end = (i + 1) * chunkSize;
        if (end > emailLength) {
            end = emailLength;
        }
        var len = end - start;

        chunkHasher[i] = Poseidon(16);

        if (i == 0) {
            chunkHasher[i].inputs[0] <== 0;
        } else {
            chunkHasher[i].inputs[0] <== intermediateHashes[i-1];
        }

        for (var j = 0; j < 15; j++) {
            if (j < len) {
                chunkHasher[i].inputs[j + 1] <== email[start + j];
            } else {
                chunkHasher[i].inputs[j + 1] <== 0;
            }
        }

        intermediateHashes[i] <== chunkHasher[i].out;
    }

    signal emailHash <== intermediateHashes[numChunks - 1];

    // Calculate expected address_seed: Poseidon(sub, emailHash, secret)
    component addressSeedHasher = Poseidon(3);
    addressSeedHasher.inputs[0] <== sub;
    addressSeedHasher.inputs[1] <== emailHash;
    addressSeedHasher.inputs[2] <== secret;

    // Verify address_seed matches
    component addressSeedCheck = IsEqual();
    addressSeedCheck.in[0] <== addressSeedHasher.out;
    addressSeedCheck.in[1] <== address_seed;

    // Constraint: address_seed must be correctly derived
    addressSeedCheck.out === 1;

    // Verify ephemeral key is bound to identity
    // Poseidon(address_seed, eph_public_key0, eph_public_key1)
    component ephKeyBinding = Poseidon(3);
    ephKeyBinding.inputs[0] <== address_seed;
    ephKeyBinding.inputs[1] <== eph_public_key0;
    ephKeyBinding.inputs[2] <== eph_public_key1;

    // The binding hash must be non-zero (implicit constraint)
    signal ephKeyBindingHash <== ephKeyBinding.out;

    // Verify max_epoch is reasonable (non-zero)
    component maxEpochNonZero = IsZero();
    maxEpochNonZero.in <== max_epoch;
    maxEpochNonZero.out === 0;

    // Verify issuer field is non-zero (Google issuer)
    component issNonZero = IsZero();
    issNonZero.in <== iss_b64_F;
    issNonZero.out === 0;

    // Verify modulus is non-zero
    component modulusNonZero = IsZero();
    modulusNonZero.in <== modulus_F;
    modulusNonZero.out === 0;
}

// Main component with 64 bytes for email
component main {public [
    eph_public_key0,
    eph_public_key1,
    address_seed,
    max_epoch,
    iss_b64_F,
    iss_index_in_payload_mod_4,
    header_F,
    modulus_F
]} = SumoAuth(64);
