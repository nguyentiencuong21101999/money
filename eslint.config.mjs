import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // App React Native — có quy ước riêng và bộ lint riêng của Expo. Luật của
    // Next.js áp vào đây là sai chỗ: metro.config.js và các config plugin BẮT
    // BUỘC dùng require() vì Metro/Expo nạp chúng dưới dạng CommonJS.
    "mobile/**",
  ]),
]);

export default eslintConfig;
