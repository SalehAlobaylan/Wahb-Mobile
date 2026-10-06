import { LinearGradient } from 'expo-linear-gradient';
import { Component, memo, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import {
  SCENE_PALETTES,
  type SceneRecipe,
  type SceneShape,
} from './scene-generator';

class SceneBoundary extends Component<
  { recipe: SceneRecipe; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? (
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: SCENE_PALETTES[this.props.recipe.family][0] },
        ]}
      />
    ) : (
      this.props.children
    );
  }
}

function SceneLayer({
  shape,
  color,
  width,
  height,
  animate,
  restrained,
}: {
  shape: SceneShape;
  color: string;
  width: number;
  height: number;
  animate: boolean;
  restrained: boolean;
}) {
  const phase = useSharedValue(0);
  useEffect(() => {
    if (animate) {
      const timing = {
        duration: shape.periodMs,
        easing: Easing.inOut(Easing.sin),
      };
      phase.value = withRepeat(
        withSequence(withTiming(1, timing), withTiming(0, timing)),
        -1,
        false,
      );
    } else {
      cancelAnimation(phase);
    }
    return () => cancelAnimation(phase);
  }, [animate, phase, shape.periodMs]);
  const motion = useAnimatedStyle(() => ({
    transform: [
      { translateX: phase.value * (restrained ? 4 : 10) },
      { translateY: phase.value * (restrained ? -6 : -18) },
      { rotate: `${shape.rotation + phase.value * (restrained ? 2 : 6)}deg` },
    ],
  }));
  const size = width * shape.size;
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: shape.x * width,
          top: shape.y * height,
          width: size,
          height: shape.kind === 'band' ? size * 0.32 : size,
          borderRadius: size,
          opacity: shape.opacity,
          backgroundColor: shape.kind === 'ring' ? 'transparent' : color,
          borderColor: color,
          borderWidth: shape.kind === 'ring' ? 2 : 0,
        },
        motion,
      ]}
    />
  );
}

export const AudioScene = memo(function AudioScene({
  recipe,
  animate,
}: {
  recipe: SceneRecipe;
  animate: boolean;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const palette = SCENE_PALETTES[recipe.family];
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="pods-audio-scene"
      onLayout={({ nativeEvent }) =>
        setSize({
          width: nativeEvent.layout.width,
          height: nativeEvent.layout.height,
        })
      }
      style={StyleSheet.absoluteFill}
    >
      <SceneBoundary key={`${recipe.seed}:${recipe.family}`} recipe={recipe}>
        <LinearGradient
          colors={[palette[0], palette[1], palette[2]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {size.width > 0 &&
          recipe.shapes.map((shape, index) => (
            <SceneLayer
              key={index}
              shape={shape}
              color={palette[3]}
              width={size.width}
              height={size.height}
              animate={animate}
              restrained={recipe.motion === 'restrained'}
            />
          ))}
      </SceneBoundary>
      <LinearGradient
        colors={['rgba(0,0,0,0.56)', 'rgba(0,0,0,0.66)', 'rgba(0,0,0,0.76)']}
        locations={[0, 0.48, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
});
