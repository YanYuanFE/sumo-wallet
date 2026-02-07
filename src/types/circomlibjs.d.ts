declare module 'circomlibjs' {
  export function buildPoseidon(): Promise<{
    (inputs: (bigint | number | string)[]): Uint8Array;
    F: {
      toObject: (value: Uint8Array) => bigint;
    };
  }>;
  
  export function buildPedersenHash(): Promise<any>;
  export function buildMimcSponge(): Promise<any>;
  export function buildEddsa(): Promise<any>;
}
