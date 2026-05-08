type PublicConfig = {
  nodeEnv: string;
  publicUrl: string;
  monorepoVersion: string;
};

export const publicConfig: PublicConfig = {
  nodeEnv: process.env.NODE_ENV ?? "production",
  publicUrl: process.env.PUBLIC_URL ?? "",
  monorepoVersion: process.env.REACT_APP_MONOREPO_VERSION ?? "",
};
