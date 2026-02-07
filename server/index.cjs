/**
 * Simple Express server for generating Garaga calldata
 * This server calls the Python script to generate calldata compatible with Garaga v0.13.3
 */

const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.GARAGA_PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '0.13.3' });
});

// Generate Garaga calldata from snarkjs proof
app.post('/api/garaga/calldata', async (req, res) => {
  const { proof, publicSignals } = req.body;

  if (!proof || !publicSignals) {
    return res.status(400).json({
      error: 'Missing proof or publicSignals'
    });
  }

  try {
    // Create temporary files for proof
    const tmpDir = os.tmpdir();
    const proofPath = path.join(tmpDir, `proof_${Date.now()}.json`);
    const vkPath = path.join(__dirname, '..', 'public', 'zk', 'verification_key.json');

    // Write proof to temp file in Garaga-compatible format
    const proofData = {
      pi_a: proof.pi_a,
      pi_b: proof.pi_b,
      pi_c: proof.pi_c,
      curve: 'bn254',
      public: publicSignals
    };

    fs.writeFileSync(proofPath, JSON.stringify(proofData, null, 2));

    // Call Python script
    const pythonPath = path.join(__dirname, '..', '.venv', 'bin', 'python3');
    const scriptPath = path.join(__dirname, '..', 'scripts', 'generate_garaga_calldata.py');

    const result = await runPythonScript(pythonPath, scriptPath, proofPath, vkPath);

    // Clean up temp file
    fs.unlinkSync(proofPath);

    res.json(result);
  } catch (error) {
    console.error('Error generating calldata:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate calldata'
    });
  }
});

function runPythonScript(pythonPath, scriptPath, proofPath, vkPath) {
  return new Promise((resolve, reject) => {
    const process = spawn(pythonPath, [scriptPath, proofPath, vkPath]);

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
      console.log('[Python]', data.toString());
    });

    process.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python script failed: ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (e) {
        reject(new Error(`Failed to parse Python output: ${stdout}`));
      }
    });

    process.on('error', (err) => {
      reject(err);
    });
  });
}

app.listen(PORT, () => {
  console.log(`Garaga calldata server running on port ${PORT}`);
  console.log(`Using Python venv at: ${path.join(__dirname, '..', '.venv')}`);
});
