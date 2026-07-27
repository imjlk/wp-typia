declare const wpEnvUtils: {
  ROOT_DIR: string;
  TEST_WP_ENV_CONFIG: string;
  getWpEnvCommand(): string;
  runWpEnv(args: string[], options?: { cwd?: string }): string;
  runWpCli(
		args: string[],
		options?: {
			configPath?: string;
			cwd?: string;
		},
	): string;
};

export = wpEnvUtils;
