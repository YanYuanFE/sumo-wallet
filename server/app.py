"""
FastAPI server for generating Garaga calldata from snarkjs Groth16 proofs.
Replaces the previous Node.js + Python subprocess approach with a direct Python server.
"""

import json
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from garaga.starknet.groth16_contract_generator.parsing_utils import (
    Groth16VerifyingKey,
    Groth16Proof,
)
from garaga.starknet.groth16_contract_generator.calldata import (
    groth16_calldata_from_vk_and_proof,
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load verification key once at startup
VK_PATH = Path(__file__).parent.parent / "public" / "zk" / "verification_key.json"
vk: Groth16VerifyingKey | None = None


@app.on_event("startup")
def load_vk():
    global vk
    if not VK_PATH.exists():
        print(f"[WARNING] Verification key not found at {VK_PATH}", file=sys.stderr)
        return
    vk = Groth16VerifyingKey.from_json(str(VK_PATH))
    print(f"VK loaded: curve={vk.curve_id}, IC length={len(vk.ic)}", file=sys.stderr)


class CalldataRequest(BaseModel):
    proof: dict
    publicSignals: list[str]


@app.get("/health")
def health():
    return {"status": "ok", "version": "1.0.1"}


@app.post("/api/garaga/calldata")
def generate_calldata(req: CalldataRequest):
    if vk is None:
        raise HTTPException(status_code=500, detail="Verification key not loaded")

    try:
        proof_data = {
            "pi_a": req.proof.get("pi_a"),
            "pi_b": req.proof.get("pi_b"),
            "pi_c": req.proof.get("pi_c"),
            "curve": "bn254",
            "public": req.publicSignals,
        }

        proof = Groth16Proof.from_dict(proof_data)
        calldata = groth16_calldata_from_vk_and_proof(vk, proof)

        result = {
            "calldata": [str(x) for x in calldata],
            "length": len(calldata),
        }
        print(f"Calldata generated: {len(calldata)} elements", file=sys.stderr)
        return result

    except Exception as e:
        print(f"Error generating calldata: {e}", file=sys.stderr)
        raise HTTPException(status_code=500, detail=str(e))
