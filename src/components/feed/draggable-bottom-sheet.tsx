import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useWahbTheme } from '@/design/theme';
import {
  collapsedSheetBaseHeight,
  sheetSnapPoints,
  type BottomSheetSnap,
} from './draggable-bottom-sheet-model';

export type { BottomSheetSnap } from './draggable-bottom-sheet-model';

export type DraggableBottomSheetHandle = {
  collapse: () => void;
  expand: () => void;
  snapTo: (snap: BottomSheetSnap) => void;
};

type Props = PropsWithChildren<{
  /** Height before the device bottom inset; News uses a handle-only variant. */
  collapsedHeight?: number;
  expandedContent: React.ReactNode;
  /** Park the collapsed sheet below the viewport while the feed advances. */
  concealed?: boolean;
  onSnapChange?: (snap: BottomSheetSnap) => void;
  testID?: string;
}>;

export const DraggableBottomSheet = forwardRef<
  DraggableBottomSheetHandle,
  Props
>(function DraggableBottomSheet(
  {
    children,
    collapsedHeight = collapsedSheetBaseHeight,
    concealed = false,
    expandedContent,
    onSnapChange,
    testID,
  },
  ref,
) {
  const { height: viewportHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { theme } = useWahbTheme();
  const points = useMemo(
    () =>
      sheetSnapPoints(
        viewportHeight,
        insets.top,
        insets.bottom,
        collapsedHeight,
      ),
    [collapsedHeight, insets.bottom, insets.top, viewportHeight],
  );
  const height = useSharedValue(points.collapsed);
  const startHeight = useSharedValue(points.collapsed);
  const concealProgress = useSharedValue(0);
  const [snap, setSnap] = useState<BottomSheetSnap>('collapsed');
  const duration = 200;
  useEffect(() => {
    height.value = points.collapsed;
  }, [height, points.collapsed]);
  // This deliberately matches the platform's LinkedIn/X-style behavior: a
  // collapsed sheet yields the whole slide while the user advances the feed.
  // Midpoint/expanded states always remain available for deliberate controls.
  const shouldConceal = concealed && snap === 'collapsed';
  useEffect(() => {
    concealProgress.value = withTiming(shouldConceal ? 1 : 0, {
      duration: 300,
      easing: Easing.inOut(Easing.ease),
    });
  }, [concealProgress, shouldConceal]);
  const setSnapValue = useCallback(
    (next: BottomSheetSnap) => {
      setSnap(next);
      onSnapChange?.(next);
    },
    [onSnapChange],
  );
  const animateTo = useCallback(
    (next: BottomSheetSnap) => {
      const target = points[next];
      height.value = withTiming(target, {
        duration,
        easing: Easing.inOut(Easing.ease),
      });
      setSnapValue(next);
    },
    [height, points, setSnapValue],
  );

  useImperativeHandle(
    ref,
    () => ({
      collapse: () => animateTo('collapsed'),
      expand: () => animateTo('expanded'),
      snapTo: animateTo,
    }),
    [animateTo],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          startHeight.value = height.value;
        })
        .onUpdate((event) => {
          height.value = Math.max(
            points.collapsed,
            Math.min(points.expanded, startHeight.value - event.translationY),
          );
        })
        .onEnd(() => {
          // This callback executes on Reanimated's UI runtime. Keep snap
          // selection inline so it never crosses the JS/UI boundary.
          const collapsedDistance = Math.abs(height.value - points.collapsed);
          const midpointDistance = Math.abs(height.value - points.midpoint);
          const expandedDistance = Math.abs(height.value - points.expanded);
          const next: BottomSheetSnap =
            collapsedDistance <= midpointDistance &&
            collapsedDistance <= expandedDistance
              ? 'collapsed'
              : midpointDistance <= expandedDistance
                ? 'midpoint'
                : 'expanded';
          height.value = withTiming(points[next], {
            duration,
            easing: Easing.inOut(Easing.ease),
          });
          runOnJS(setSnapValue)(next);
        }),
    [height, points, setSnapValue, startHeight],
  );
  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .maxDelay(300)
        .onEnd(() => {
          const next: BottomSheetSnap =
            height.value > points.collapsed + 20 ? 'collapsed' : 'expanded';
          height.value = withTiming(points[next], {
            duration,
            easing: Easing.inOut(Easing.ease),
          });
          runOnJS(setSnapValue)(next);
        }),
    [height, points, setSnapValue],
  );
  const handleGesture = useMemo(
    () => Gesture.Simultaneous(pan, doubleTap),
    [doubleTap, pan],
  );
  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
    transform: [{ translateY: concealProgress.value * (height.value + 8) }],
  }));

  return (
    <Animated.View
      testID={testID}
      pointerEvents={shouldConceal ? 'none' : 'auto'}
      style={[
        styles.sheet,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
          paddingBottom: insets.bottom,
        },
        animatedStyle,
      ]}
    >
      <GestureDetector gesture={handleGesture}>
        <View
          accessibilityRole="adjustable"
          accessibilityValue={{
            min: points.collapsed,
            max: points.expanded,
            now: points[snap],
          }}
          style={styles.handleRegion}
        >
          <View
            style={[styles.handle, { backgroundColor: theme.mutedForeground }]}
          />
        </View>
      </GestureDetector>
      <View
        style={[
          styles.collapsed,
          { minHeight: Math.max(0, collapsedHeight - handleHeight) },
        ]}
      >
        {children}
      </View>
      <View
        pointerEvents={snap === 'collapsed' ? 'none' : 'auto'}
        style={styles.expanded}
      >
        {snap === 'collapsed' ? null : expandedContent}
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  sheet: {
    bottom: 0,
    borderTopWidth: 1,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    zIndex: 30,
  },
  handleRegion: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 20,
    paddingHorizontal: 12,
  },
  handle: { borderRadius: 999, height: 3, width: 32 },
  collapsed: { paddingHorizontal: 12 },
  expanded: { flex: 1, minHeight: 0, paddingHorizontal: 12, paddingTop: 6 },
});

const handleHeight = 20;
