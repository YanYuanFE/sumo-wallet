pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/sha256/sha256.circom";

/**
 * SUMO Auth Circuit (Official Version)
 *
 * 输出所有公共输入的 SHA256 哈希，与官方 Cairo 合约兼容。
 *
 * Public Output:
 * - all_inputs_hash: SHA256(eph_key0 || eph_key1 || address_seed || ...)
 *
 * 注意：由于 BN254 曲线域大小约为 254 位，每个 u256 输入被拆分为
 * high (128 bits) 和 low (128 bits) 两部分处理。
 */

template SumoAuthOfficial(emailLength) {
    // ===== 私有输入（原公共输入变为私有）=====
    // 每个 u256 拆分为 high/low 两个 u128
    signal input eph_public_key0_high;
    signal input eph_public_key0_low;
    signal input eph_public_key1_high;
    signal input eph_public_key1_low;
    signal input address_seed_high;
    signal input address_seed_low;
    signal input max_epoch;  // u64, 不需要拆分
    signal input iss_b64_F_high;
    signal input iss_b64_F_low;
    signal input iss_index_in_payload_mod_4;  // u8, 不需要拆分
    signal input header_F_high;
    signal input header_F_low;
    signal input modulus_F_high;
    signal input modulus_F_low;

    // ===== 私有输入 =====
    signal input sub;
    signal input email[emailLength];
    signal input secret;

    // ===== 公共输出：SHA256 哈希 (2 个 u128) =====
    signal output all_inputs_hash_high;  // 高 128 bits
    signal output all_inputs_hash_low;   // 低 128 bits

    // ===== 验证逻辑 =====

    // 计算 email hash
    var chunkSize = 15;
    var numChunks = (emailLength + chunkSize - 1) \ chunkSize;
    component chunkHasher[numChunks];
    signal intermediateHashes[numChunks];

    for (var i = 0; i < numChunks; i++) {
        var start = i * chunkSize;
        var end = (i + 1) * chunkSize;
        if (end > emailLength) { end = emailLength; }
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

    // 重组 address_seed 用于验证
    signal address_seed_combined <== address_seed_high * (1 << 128) + address_seed_low;

    // 验证 address_seed: Poseidon(sub, emailHash, secret)
    component addressSeedHasher = Poseidon(3);
    addressSeedHasher.inputs[0] <== sub;
    addressSeedHasher.inputs[1] <== emailHash;
    addressSeedHasher.inputs[2] <== secret;

    component addressSeedCheck = IsEqual();
    addressSeedCheck.in[0] <== addressSeedHasher.out;
    addressSeedCheck.in[1] <== address_seed_combined;
    addressSeedCheck.out === 1;

    // ===== 计算 SHA256 哈希 =====
    // 将所有输入转换为 bits 并拼接
    // 总共 8 个 u256 = 8 * 256 = 2048 bits

    // 转换每个 u128 为 128 bits
    component bits_eph0_high = Num2Bits(128);
    component bits_eph0_low = Num2Bits(128);
    component bits_eph1_high = Num2Bits(128);
    component bits_eph1_low = Num2Bits(128);
    component bits_addr_high = Num2Bits(128);
    component bits_addr_low = Num2Bits(128);
    component bits_max_epoch = Num2Bits(128);
    component bits_iss_high = Num2Bits(128);
    component bits_iss_low = Num2Bits(128);
    component bits_idx = Num2Bits(128);
    component bits_header_high = Num2Bits(128);
    component bits_header_low = Num2Bits(128);
    component bits_mod_high = Num2Bits(128);
    component bits_mod_low = Num2Bits(128);

    // 连接输入
    bits_eph0_high.in <== eph_public_key0_high;
    bits_eph0_low.in <== eph_public_key0_low;
    bits_eph1_high.in <== eph_public_key1_high;
    bits_eph1_low.in <== eph_public_key1_low;
    bits_addr_high.in <== address_seed_high;
    bits_addr_low.in <== address_seed_low;
    bits_max_epoch.in <== max_epoch;
    bits_iss_high.in <== iss_b64_F_high;
    bits_iss_low.in <== iss_b64_F_low;
    bits_idx.in <== iss_index_in_payload_mod_4;
    bits_header_high.in <== header_F_high;
    bits_header_low.in <== header_F_low;
    bits_mod_high.in <== modulus_F_high;
    bits_mod_low.in <== modulus_F_low;

    // 拼接所有 bits (大端序，与 Cairo 一致)
    // 每个 u256 = high (128 bits) + low (128 bits)
    signal sha_input[2048];

    // eph_public_key0 (256 bits)
    for (var i = 0; i < 128; i++) {
        sha_input[i] <== bits_eph0_high.out[127 - i];
        sha_input[128 + i] <== bits_eph0_low.out[127 - i];
    }

    // eph_public_key1 (256 bits)
    for (var i = 0; i < 128; i++) {
        sha_input[256 + i] <== bits_eph1_high.out[127 - i];
        sha_input[384 + i] <== bits_eph1_low.out[127 - i];
    }

    // address_seed (256 bits)
    for (var i = 0; i < 128; i++) {
        sha_input[512 + i] <== bits_addr_high.out[127 - i];
        sha_input[640 + i] <== bits_addr_low.out[127 - i];
    }

    // max_epoch (256 bits, 高位补零)
    for (var i = 0; i < 128; i++) {
        sha_input[768 + i] <== 0;  // 高 128 位为 0
        sha_input[896 + i] <== bits_max_epoch.out[127 - i];
    }

    // iss_b64_F (256 bits)
    for (var i = 0; i < 128; i++) {
        sha_input[1024 + i] <== bits_iss_high.out[127 - i];
        sha_input[1152 + i] <== bits_iss_low.out[127 - i];
    }

    // iss_index_in_payload_mod_4 (256 bits, 高位补零)
    for (var i = 0; i < 128; i++) {
        sha_input[1280 + i] <== 0;  // 高 128 位为 0
        sha_input[1408 + i] <== bits_idx.out[127 - i];
    }

    // header_F (256 bits)
    for (var i = 0; i < 128; i++) {
        sha_input[1536 + i] <== bits_header_high.out[127 - i];
        sha_input[1664 + i] <== bits_header_low.out[127 - i];
    }

    // modulus_F (256 bits)
    for (var i = 0; i < 128; i++) {
        sha_input[1792 + i] <== bits_mod_high.out[127 - i];
        sha_input[1920 + i] <== bits_mod_low.out[127 - i];
    }

    // 计算 SHA256
    component sha256 = Sha256(2048);
    for (var i = 0; i < 2048; i++) {
        sha256.in[i] <== sha_input[i];
    }

    // 将 256 bits 转换为 2 个 u128 数值
    component bitsToHigh = Bits2Num(128);
    component bitsToLow = Bits2Num(128);

    // 高 128 bits (大端序)
    for (var i = 0; i < 128; i++) {
        bitsToHigh.in[127 - i] <== sha256.out[i];
    }

    // 低 128 bits (大端序)
    for (var i = 0; i < 128; i++) {
        bitsToLow.in[127 - i] <== sha256.out[128 + i];
    }

    all_inputs_hash_high <== bitsToHigh.out;
    all_inputs_hash_low <== bitsToLow.out;
}

// Output signals 默认是公开的，不需要在 public 列表中声明
component main = SumoAuthOfficial(64);
