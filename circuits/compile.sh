#!/bin/bash

# JWT Verify Circuit Compilation Script
# This script compiles the Circom circuit and generates proving/verification keys

set -e

echo "=== JWT Verify Circuit Compilation ==="

# Check if circom is installed
if ! command -v circom &> /dev/null; then
    echo "Error: circom is not installed. Please install it first:"
    echo "  https://docs.circom.io/getting-started/installation/"
    exit 1
fi

# Create output directories
mkdir -p build
mkdir -p ../public/zk

echo "1. Compiling circuit..."
circom jwt_verify.circom --r1cs --wasm --sym -o build/

echo "2. Trusted setup (Phase 1 - Powers of Tau)..."
# Download powers of tau file if not exists
if [ ! -f "build/pot12_final.ptau" ]; then
    echo "   Downloading powers of tau file..."
    # Using a small ptau file for development (2^12 = 4092 constraints)
    # For production, use a larger file
    curl -L https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_12.ptau \
        -o build/pot12_final.ptau
fi

echo "3. Trusted setup (Phase 2 - Circuit specific)..."
snarkjs groth16 setup build/jwt_verify.r1cs build/pot12_final.ptau build/jwt_verify_0000.zkey

echo "4. Contributing to phase 2..."
snarkjs zkey contribute build/jwt_verify_0000.zkey build/jwt_verify_final.zkey \
    --name="SUMO Login Demo" -v -e="random entropy"

echo "5. Exporting verification key..."
snarkjs zkey export verificationkey build/jwt_verify_final.zkey build/verification_key.json

echo "6. Copying files to public directory..."
cp build/jwt_verify_js/jwt_verify.wasm ../public/zk/
cp build/jwt_verify_final.zkey ../public/zk/
cp build/verification_key.json ../public/zk/

echo "=== Compilation Complete ==="
echo "Files generated:"
echo "  - public/zk/jwt_verify.wasm"
echo "  - public/zk/jwt_verify_final.zkey"
echo "  - public/zk/verification_key.json"
