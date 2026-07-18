import { z } from 'zod';

const envSchema = z.object({
  EXPO_PUBLIC_CMS_URL: z.url().default('http://localhost:8080'),
  EXPO_PUBLIC_IAM_URL: z.url().default('http://localhost:4003'),
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): AppEnv {
  return envSchema.parse(source);
}

let cachedEnv: AppEnv | undefined;

export function getEnv(): AppEnv {
  cachedEnv ??= parseEnv(process.env);
  return cachedEnv;
}
