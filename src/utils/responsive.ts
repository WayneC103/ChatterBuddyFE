import {Dimensions} from 'react-native';

const {width: screenWidth, height: screenHeight} = Dimensions.get('window');

// Base dimensions (iPhone 11/12 as reference)
const baseWidth = 414;
const baseHeight = 896;

// Check if device is tablet
export const isTablet = () => {
  const aspectRatio = screenHeight / screenWidth;
  return screenWidth >= 768 && aspectRatio < 1.6;
};

// Scale function for responsive sizing
export const scale = (size: number): number => {
  const scaleWidth = screenWidth / baseWidth;
  const scaleHeight = screenHeight / baseHeight;
  const minScale = Math.min(scaleWidth, scaleHeight);

  // For tablets, limit scaling to prevent UI from becoming too large
  if (isTablet()) {
    return size * Math.min(minScale, 1.5);
  }

  return size * minScale;
};

// Responsive font scaling
export const scaleFontSize = (size: number): number => {
  const scaleWidth = screenWidth / baseWidth;

  if (isTablet()) {
    // More conservative font scaling for tablets
    return size * Math.min(scaleWidth, 1.3);
  }

  return size * scaleWidth;
};

// Responsive horizontal scaling
export const scaleHorizontal = (size: number): number => {
  return (screenWidth / baseWidth) * size;
};

// Responsive vertical scaling
export const scaleVertical = (size: number): number => {
  return (screenHeight / baseHeight) * size;
};

// Get responsive padding based on screen size
export const getResponsivePadding = (): {
  horizontal: number;
  vertical: number;
  small: number;
  medium: number;
  large: number;
} => {
  if (isTablet()) {
    return {
      horizontal: scale(40),
      vertical: scale(60),
      small: scale(16),
      medium: scale(24),
      large: scale(40),
    };
  }

  return {
    horizontal: scale(24),
    vertical: scale(40),
    small: scale(12),
    medium: scale(16),
    large: scale(24),
  };
};

// Get responsive icon sizes
export const getIconSizes = () => {
  return {
    small: scale(18),
    medium: scale(24),
    large: scale(32),
    xlarge: scale(40),
  };
};

// Get responsive button sizes
export const getButtonSizes = () => {
  return {
    small: {
      width: scale(40),
      height: scale(40),
      borderRadius: scale(20),
    },
    medium: {
      width: scale(48),
      height: scale(48),
      borderRadius: scale(24),
    },
    large: {
      width: scale(56),
      height: scale(56),
      borderRadius: scale(28),
    },
    xlarge: {
      width: scale(72),
      height: scale(72),
      borderRadius: scale(36),
    },
  };
};

export const responsive = {
  width: screenWidth,
  height: screenHeight,
  scale,
  scaleFontSize,
  scaleHorizontal,
  scaleVertical,
  isTablet: isTablet(),
  padding: getResponsivePadding(),
  iconSizes: getIconSizes(),
  buttonSizes: getButtonSizes(),
};
