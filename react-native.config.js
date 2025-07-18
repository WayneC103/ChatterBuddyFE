module.exports = {
  codegen: {
    libraries: {
      "react-native-safe-area-context": {
        ios: {
          sourceDir: "../node_modules/react-native-safe-area-context/ios",
          exclude: true,
        },
      },
      "react-native-screens": {
        ios: {
          sourceDir: "../node_modules/react-native-screens/ios",
          exclude: true,
        },
      },
    },
  },
};
