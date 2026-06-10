declare module '@repo/shared/deployment-secrets' {
  export function decryptEncryptedEnvVars(
    envKeys: string[],
    secretKeyHex: string | undefined,
  ): void;
}
