import React, {useEffect, useState} from 'react';
import {View, Text, Switch, StyleSheet, TouchableOpacity} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useNavigation} from '@react-navigation/native';
import {responsive} from '../utils/responsive';

const STORAGE_KEY = 'startTalkingOnOpen';

const SettingsScreen: React.FC = () => {
  const navigation = useNavigation();
  const [startTalking, setStartTalking] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const value = await AsyncStorage.getItem(STORAGE_KEY);
      if (value !== null) setStartTalking(value === 'true');
      setLoading(false);
    })();
  }, []);

  const toggleSwitch = async () => {
    const newValue = !startTalking;
    setStartTalking(newValue);
    await AsyncStorage.setItem(STORAGE_KEY, newValue ? 'true' : 'false');
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>{'< Back'}</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Settings</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Start talking as soon as app opens</Text>
        <Switch
          value={startTalking}
          onValueChange={toggleSwitch}
          disabled={loading}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a1a',
    paddingTop: responsive.isTablet
      ? responsive.scale(80)
      : responsive.scale(60),
    paddingHorizontal: responsive.padding.horizontal,
  },
  backButton: {
    position: 'absolute',
    top: responsive.isTablet ? responsive.scale(50) : responsive.scale(30),
    left: responsive.scale(16),
    zIndex: 10,
  },
  backText: {
    color: '#4CAF50',
    fontSize: responsive.scaleFontSize(16),
    fontWeight: '600',
  },
  title: {
    fontSize: responsive.scaleFontSize(28),
    color: '#fff',
    fontWeight: '700',
    marginBottom: responsive.scale(40),
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#181a2a',
    borderRadius: responsive.scale(12),
    padding: responsive.scale(20),
    marginBottom: responsive.scale(20),
  },
  label: {
    color: '#fff',
    fontSize: responsive.scaleFontSize(16),
    flex: 1,
    marginRight: responsive.scale(10),
  },
});

export default SettingsScreen;
