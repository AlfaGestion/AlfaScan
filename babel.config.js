module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          alias: {
            "@components": "./src/components",
            "@screens": "./src/screens",
            "@libraries": "./src/libraries",
            "@routes": "./src/routes",
            "@db": "./src/libraries/db",
            "@assets": "./assets",
            "@icons": "./assets/icons",
            "@storage": "./src/storage",
            "@context": "./src/context",
            "@styles": "./src/styles",
            "@services": "./src/services",
            "@models": "./src/models",
            "@utils": "./src/utils",
            "@hooks": "./src/hooks",
          },
        },
      ],
    ],
  };
};
