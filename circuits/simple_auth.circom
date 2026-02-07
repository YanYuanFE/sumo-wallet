pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

/**
 * SimpleAuth Circuit
 * 
 * A simplified authentication circuit for SUMO Login.
 * Proves knowledge of a secret (derived from JWT) without revealing it.
 * 
 * Public Inputs:
 * - identityCommitment: Poseidon hash of (email, sub, secret)
 * - sessionPublicKey: The ephemeral public key
 * 
 * Private Inputs:
 * - email: User's email (padded to fixed length)
 * - sub: Google subject ID
 * - secret: A secret derived from JWT signature
 */

template SimpleAuth(emailLength) {
    // Public inputs
    signal input identityCommitment;
    signal input sessionPublicKey;
    
    // Private inputs
    signal input email[emailLength];
    signal input sub;
    signal input secret;
    
    // Output: validity signal
    signal output valid;
    
    // Calculate hash of email using iterative Poseidon hashing
    // Each Poseidon instance supports up to 16 inputs
    var chunkSize = 15;  // 15 data inputs + 1 for chaining = 16 total
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
        
        // Use Poseidon(16) with padding
        chunkHasher[i] = Poseidon(16);
        
        // First input is the previous hash (0 for first chunk)
        if (i == 0) {
            chunkHasher[i].inputs[0] <== 0;
        } else {
            chunkHasher[i].inputs[0] <== intermediateHashes[i-1];
        }
        
        // Fill in the email bytes
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
    
    // Calculate identity commitment: Poseidon(emailHash, sub, secret)
    component identityHasher = Poseidon(3);
    identityHasher.inputs[0] <== emailHash;
    identityHasher.inputs[1] <== sub;
    identityHasher.inputs[2] <== secret;
    
    // Verify identity commitment matches
    component commitmentCheck = IsEqual();
    commitmentCheck.in[0] <== identityHasher.out;
    commitmentCheck.in[1] <== identityCommitment;
    
    // Calculate session authorization: Poseidon(identityCommitment, sessionPublicKey)
    component sessionHasher = Poseidon(2);
    sessionHasher.inputs[0] <== identityCommitment;
    sessionHasher.inputs[1] <== sessionPublicKey;
    
    // Valid if commitment matches
    valid <== commitmentCheck.out;
    
    // Constraint: valid must be 1
    valid === 1;
}

// Main: 32 bytes for email (sufficient for most emails)
component main {public [identityCommitment, sessionPublicKey]} = SimpleAuth(32);
