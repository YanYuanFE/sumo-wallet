#!/bin/bash

# SUMO Auth Circuit Compilation Script
set -e

echo "=== SUMO Auth Circuit Compilation ==="

# Check if circom is installed
if ! command -v circom &> /dev/null; then
    echo "Error: circom is not installed"
    exit 1
fi

# Create output directories
mkdir -p build
mkdir -p ../public/zk

echo "1. Compiling circuit..."
circom sumo_auth.circom --r1cs --wasm --sym -o build/

echo "2. Downloading powers of tau..."
if [ ! -f "build/pot16_final.ptau" ]; then
    curl -L https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_16.ptau \
        -o build/pot16_final.ptau
fi

echo "3. Trusted setup (Phase 2)..."
snarkjs groth16 setup build/sumo_auth.r1cs build/pot16_final.ptau build/sumo_auth_0000.zkey

echo "4. Contributing to phase 2..."
snarkjs zkey contribute build/sumo_auth_0000.zkey build/sumo_auth_final.zkey \
    --name="SUMO Auth" -v -e="random entropy"

echo "5. Exporting verification key..."
snarkjs zkey export verificationkey build/sumo_auth_final.zkey build/verification_key.json

echo "6. Copying files..."
cp build/sumo_auth_js/sumo_auth.wasm ../public/zk/sumo_auth.wasm
cp build/sumo_auth_final.zkey ../public/zk/sumo_auth_final.zkey
cp build/verification_key.json ../public/zk/verification_key.json

echo "=== Done ==="
