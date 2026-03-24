import { Config } from "@remotion/cli/config";

Config.setEntryPoint("./src/index.ts");
Config.overrideWebpackConfig((currentConfiguration) => {
  return {
    ...currentConfiguration,
    resolve: {
      ...currentConfiguration.resolve,
      extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json", ...(currentConfiguration.resolve?.extensions ?? [])],
    },
  };
});
