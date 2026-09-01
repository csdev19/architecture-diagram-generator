import { fullstackServerEnvSchema } from "@diagram-tool/infra-env";

export const env = fullstackServerEnvSchema.parse(process.env);
