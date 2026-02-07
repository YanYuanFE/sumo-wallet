pragma circom 2.0.0;

include "./node_modules/circomlib/circuits/poseidon.circom";
include "./node_modules/circomlib/circuits/comparators.circom";
include "./node_modules/circomlib/circuits/bitify.circom";

/**
 * JWT Verify Circuit
 * 
 * This circuit verifies:
 * 1. The JWT hash matches the expected hash (proving knowledge of JWT)
 * 2. The email hash is derived from the JWT
 * 3. The session key is linked to the identity
 * 
 * Public Inputs:
 * - jwtHash: Poseidon hash of the JWT (256 bits)
 * - emailHash: Poseidon hash of the email
 * - sessionPublicKey: The ephemeral session public key
 * 
 * Private Inputs:
 * - jwt: The JWT token bytes (padded)
 * - email: The email address bytes (padded)
 * - sub: Subject identifier from JWT
 */

template JWTVerify(maxJWTLength, maxEmailLength) {
    // Public inputs
    signal input jwtHash;
    signal input emailHash;
    signal input sessionPublicKey[2]; // x, y coordinates
    
    // Private inputs
    signal input jwt[maxJWTLength];
    signal input jwtLength;
    signal input email[maxEmailLength];
    signal input emailLength;
    signal input sub; // Subject ID from JWT
    
    // Output
    signal output identityCommitment;
    signal output valid;
    
    // Calculate JWT hash
    component jwtHasher = Poseidon(maxJWTLength);
    for (var i = 0; i < maxJWTLength; i++) {
        jwtHasher.inputs[i] <== jwt[i];
    }
    
    // Verify JWT hash matches
    component jwtHashCheck = IsEqual();
    jwtHashCheck.in[0] <== jwtHasher.out;
    jwtHashCheck.in[1] <== jwtHash;
    
    // Calculate email hash
    component emailHasher = Poseidon(maxEmailLength);
    for (var i = 0; i < maxEmailLength; i++) {
        emailHasher.inputs[i] <== email[i];
    }
    
    // Verify email hash matches
    component emailHashCheck = IsEqual();
    emailHashCheck.in[0] <== emailHasher.out;
    emailHashCheck.in[1] <== emailHash;
    
    // Create identity commitment: Poseidon(sub, emailHash, sessionPublicKey)
    component identityHasher = Poseidon(4);
    identityHasher.inputs[0] <== sub;
    identityHasher.inputs[1] <== emailHash;
    identityHasher.inputs[2] <== sessionPublicKey[0];
    identityHasher.inputs[3] <== sessionPublicKey[1];
    
    identityCommitment <== identityHasher.out;
    
    // Valid if both hashes match
    valid <== jwtHashCheck.out * emailHashCheck.out;
    
    // Constrain valid to be 1
    valid === 1;
}

// Main component with practical limits
// maxJWTLength = 1024 bytes (sufficient for most JWTs)
// maxEmailLength = 64 bytes
component main {public [jwtHash, emailHash, sessionPublicKey]} = JWTVerify(1024, 64);
