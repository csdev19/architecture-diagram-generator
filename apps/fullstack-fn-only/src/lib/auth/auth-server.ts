import { betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { baseConfig } from "@diagram-tool/infra-auth";

export const auth = betterAuth({
  ...baseConfig,
  plugins: [...(baseConfig.plugins ?? []), tanstackStartCookies()],
});
