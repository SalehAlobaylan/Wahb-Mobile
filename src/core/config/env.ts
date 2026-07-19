import { z } from 'zod';

const envSchema = z.object({
  EXPO_PUBLIC_CMS_URL: z.url().default('http://localhost:8080'),
  EXPO_PUBLIC_IAM_URL: z.url().default('http://localhost:4003'),
  EXPO_PUBLIC_SENTRY_DSN: z.url().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): AppEnv {
  return envSchema.parse(source);
}

let cachedEnv: AppEnv | undefined;

export function getEnv(): AppEnv {
  // Expo only substitutes statically referenced EXPO_PUBLIC_* values. Keep the
  // public runtime contract explicit here, and never add a secret to it.
  cachedEnv ??= parseEnv({
    EXPO_PUBLIC_CMS_URL: process.env.EXPO_PUBLIC_CMS_URL,
    EXPO_PUBLIC_IAM_URL: process.env.EXPO_PUBLIC_IAM_URL,
    EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
  });
  return cachedEnv;
}
