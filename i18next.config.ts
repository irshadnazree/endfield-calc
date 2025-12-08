import { defineConfig } from "i18next-cli";

export default defineConfig({
  locales: ["zh-Hans", "zh-Hant", "en", "es", "ja", "ko", "ru"],
  extract: {
    input: "src/**/*.{js,jsx,ts,tsx}",
    output: "public/locales/{{language}}/{{namespace}}.json",
  },
});
