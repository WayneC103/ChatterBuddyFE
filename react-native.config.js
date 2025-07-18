module.exports = {
  dependencies: {
    "react-native-safe-area-context": {
      platforms: {
        ios: {
          sourceDir: "../node_modules/react-native-safe-area-context/ios",
          podfile: true,
          scriptPhases: [
            {
              name: "[CP] Copy Bundle Resources",
              script:
                'cp -r "${PODS_ROOT}/../../node_modules/react-native-safe-area-context/ios/RCTSafeAreaContext" "${BUILT_PRODUCTS_DIR}/${WRAPPER_NAME}"',
              inputPaths: [
                "${PODS_ROOT}/../../node_modules/react-native-safe-area-context/ios/RCTSafeAreaContext",
              ],
              outputPaths: [
                "${BUILT_PRODUCTS_DIR}/${WRAPPER_NAME}/RCTSafeAreaContext",
              ],
            },
          ],
        },
      },
    },
    "react-native-screens": {
      platforms: {
        ios: {
          sourceDir: "../node_modules/react-native-screens/ios",
          podfile: true,
          scriptPhases: [
            {
              name: "[CP] Copy Bundle Resources",
              script:
                'cp -r "${PODS_ROOT}/../../node_modules/react-native-screens/ios/RNScreens" "${BUILT_PRODUCTS_DIR}/${WRAPPER_NAME}"',
              inputPaths: [
                "${PODS_ROOT}/../../node_modules/react-native-screens/ios/RNScreens",
              ],
              outputPaths: ["${BUILT_PRODUCTS_DIR}/${WRAPPER_NAME}/RNScreens"],
            },
          ],
        },
      },
    },
  },
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
