import { GARAGA_API_URL } from '@/adapters/config/network';

export interface SnarkJSProof {
  proof: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
    curve: string;
  };
  publicSignals: string[];
}

export async function checkGaragaApiHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${GARAGA_API_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    console.error('[checkGaragaApiHealth] API health check failed:', error);
    return false;
  }
}

export function getGaragaApiUrl(): string {
  return GARAGA_API_URL;
}

export async function convertSnarkjsProofToGaraga(proof: SnarkJSProof): Promise<string[]> {
  console.log("[convertSnarkjsProofToGaraga] Calling backend API for Garaga v0.13.3 calldata...");

  try {
    const response = await fetch(`${GARAGA_API_URL}/api/garaga/calldata`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        proof: proof.proof,
        publicSignals: proof.publicSignals,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API request failed: ${response.status}`);
    }

    const result = await response.json();
    console.log("[convertSnarkjsProofToGaraga] Calldata received, length:", result.calldata?.length || result.length);
    console.log("[convertSnarkjsProofToGaraga] Expected length: ~3013 (0xbc5)");
    console.log("[convertSnarkjsProofToGaraga] === Full Garaga Calldata (for Cairo testing) ===");
    console.log("[convertSnarkjsProofToGaraga] calldata:", JSON.stringify(result.calldata));

    return result.calldata;
  } catch (error) {
    console.error("[convertSnarkjsProofToGaraga] API call failed:", error);

    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    const isConnectionError = errorMsg.includes('fetch') || errorMsg.includes('network') || errorMsg.includes('ECONNREFUSED');

    if (isConnectionError) {
      throw new Error(
        `Garaga API 服务未响应\n\n` +
        `请确保后端服务正在运行：\n` +
        `  1. 打开新终端窗口\n` +
        `  2. 运行命令: npm run server\n` +
        `  3. 等待服务启动后重试\n\n` +
        `API 地址: ${GARAGA_API_URL}`
      );
    }

    throw new Error(
      `Garaga calldata 生成失败: ${errorMsg}\n\n` +
      `排查步骤：\n` +
      `  1. 检查服务是否运行: npm run server\n` +
      `  2. API 地址: ${GARAGA_API_URL}/api/garaga/calldata\n` +
      `  3. 查看服务器日志获取详细错误信息`
    );
  }
}
