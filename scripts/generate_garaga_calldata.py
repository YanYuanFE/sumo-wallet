#!/usr/bin/env python3
"""
Generate Garaga calldata from snarkjs proof for Groth16 verification.
This script is called from TypeScript to generate calldata compatible with
Garaga v0.13.3 Cairo contracts.

Usage:
    python3 scripts/generate_garaga_calldata.py <proof_json> <vk_json> [output_json]
"""

import sys
import json
from pathlib import Path

# Add the virtual environment to the path
venv_path = Path(__file__).parent.parent / ".venv" / "lib" / "python3.10" / "site-packages"
if venv_path.exists():
    sys.path.insert(0, str(venv_path))

from garaga.starknet.groth16_contract_generator.parsing_utils import (
    Groth16VerifyingKey,
    Groth16Proof,
)
from garaga.starknet.groth16_contract_generator.calldata import (
    groth16_calldata_from_vk_and_proof,
)


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 generate_garaga_calldata.py <proof_json> <vk_json> [output_json]")
        sys.exit(1)

    proof_path = sys.argv[1]
    vk_path = sys.argv[2]
    output_path = sys.argv[3] if len(sys.argv) > 3 else None

    # Parse verification key
    vk = Groth16VerifyingKey.from_json(vk_path)
    print(f"VK loaded: curve={vk.curve_id}, IC length={len(vk.ic)}", file=sys.stderr)

    # Parse proof
    proof = Groth16Proof.from_json(proof_path)
    print(f"Proof loaded: curve={proof.curve_id}", file=sys.stderr)

    # Generate calldata
    calldata = groth16_calldata_from_vk_and_proof(vk, proof)
    print(f"Calldata generated: {len(calldata)} elements", file=sys.stderr)

    # Output as JSON
    result = {
        "calldata": [str(x) for x in calldata],
        "length": len(calldata),
    }

    if output_path:
        with open(output_path, "w") as f:
            json.dump(result, f)
        print(f"Calldata written to {output_path}", file=sys.stderr)
    else:
        # Output to stdout for piping
        print(json.dumps(result))


if __name__ == "__main__":
    main()
