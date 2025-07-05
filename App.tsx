/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React from 'react';
import {StatusBar, StyleSheet, View} from 'react-native';
import AvatarScreen from './src/components/AvatarScreen';

function App(): React.JSX.Element {
  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <AvatarScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});

export default App;
