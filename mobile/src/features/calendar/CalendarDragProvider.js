import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const CalendarDragContext = createContext({
  isDragging: false,
  draggedEvent: null,
  dragPosition: { x: 0, y: 0 },
  startDrag: () => {},
  endDrag: () => {},
  registerDropTarget: () => () => {},
});

export function useCalendarDrag() {
  return useContext(CalendarDragContext);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LONG_PRESS_DURATION_MS = 500;
const GHOST_SIZE = { width: 140, height: 44 };

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * Provides drag-and-drop context for calendar views.
 *
 * Wraps children with a gesture handler overlay that shows a floating "ghost"
 * element when an event is being dragged.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @param {boolean} props.enabled - Whether drag is allowed (parent mode only)
 * @param {Function} props.onDrop - Called with { event, targetDayKey, targetMinute? }
 * @param {Function} props.onDragStart - Called when drag begins
 * @param {Object} props.colors - Theme colors
 */
export function CalendarDragProvider({
  children,
  enabled = true,
  onDrop,
  onDragStart,
  colors,
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [draggedEvent, setDraggedEvent] = useState(null);
  const [ghostLabel, setGhostLabel] = useState('');

  // Shared values for smooth animated position
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const ghostOpacity = useSharedValue(0);
  const ghostScale = useSharedValue(0.85);

  // Drop target registry: Map<dayKey, { x, y, width, height }>
  const dropTargets = useRef(new Map());

  const registerDropTarget = useCallback((dayKey, layout) => {
    if (layout) {
      dropTargets.current.set(dayKey, layout);
    } else {
      dropTargets.current.delete(dayKey);
    }
    // Return unregister function
    return () => dropTargets.current.delete(dayKey);
  }, []);

  const findDropTarget = useCallback((x, y) => {
    for (const [dayKey, layout] of dropTargets.current.entries()) {
      if (
        x >= layout.x &&
        x <= layout.x + layout.width &&
        y >= layout.y &&
        y <= layout.y + layout.height
      ) {
        // Calculate minute within the day if the target has time info
        let targetMinute = null;
        if (layout.totalHeight && layout.hourHeight) {
          const relativeY = y - layout.y;
          targetMinute = Math.round((relativeY / layout.totalHeight) * 1440 / 15) * 15;
          targetMinute = Math.max(0, Math.min(targetMinute, 1425));
        }
        return { dayKey, targetMinute };
      }
    }
    return null;
  }, []);

  const startDrag = useCallback((event, startX, startY) => {
    if (!enabled) return;

    setDraggedEvent(event);
    setGhostLabel(event.title || 'Untitled');
    setIsDragging(true);
    translateX.value = startX - GHOST_SIZE.width / 2;
    translateY.value = startY - GHOST_SIZE.height / 2;
    ghostOpacity.value = withTiming(0.9, { duration: 150 });
    ghostScale.value = withSpring(1.05, { damping: 12, stiffness: 200 });

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDragStart?.({ event });
  }, [enabled, onDragStart, translateX, translateY, ghostOpacity, ghostScale]);

  const updateDrag = useCallback((x, y) => {
    translateX.value = x - GHOST_SIZE.width / 2;
    translateY.value = y - GHOST_SIZE.height / 2;
  }, [translateX, translateY]);

  const endDrag = useCallback((x, y) => {
    const target = findDropTarget(x, y);

    ghostOpacity.value = withTiming(0, { duration: 120 });
    ghostScale.value = withTiming(0.85, { duration: 120 });

    if (target && draggedEvent) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDrop?.({
        event: draggedEvent,
        targetDayKey: target.dayKey,
        targetMinute: target.targetMinute,
      });
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }

    // Delay cleanup to let fade-out animation complete
    setTimeout(() => {
      setIsDragging(false);
      setDraggedEvent(null);
      setGhostLabel('');
    }, 140);
  }, [findDropTarget, draggedEvent, onDrop, ghostOpacity, ghostScale]);

  const cancelDrag = useCallback(() => {
    ghostOpacity.value = withTiming(0, { duration: 100 });
    ghostScale.value = withTiming(0.85, { duration: 100 });
    setTimeout(() => {
      setIsDragging(false);
      setDraggedEvent(null);
      setGhostLabel('');
    }, 120);
  }, [ghostOpacity, ghostScale]);

  // Animated ghost styles
  const ghostAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: ghostScale.value },
    ],
    opacity: ghostOpacity.value,
  }));

  const contextValue = useMemo(
    () => ({
      isDragging,
      draggedEvent,
      dragPosition: { x: translateX, y: translateY },
      startDrag,
      updateDrag,
      endDrag,
      cancelDrag,
      registerDropTarget,
    }),
    [isDragging, draggedEvent, startDrag, updateDrag, endDrag, cancelDrag, registerDropTarget, translateX, translateY]
  );

  return (
    <CalendarDragContext.Provider value={contextValue}>
      {children}
      {/* Floating ghost element */}
      {isDragging ? (
        <Animated.View
          style={[styles.ghost, ghostAnimatedStyle, colors && { backgroundColor: colors.accentCalendar }]}
          pointerEvents="none"
        >
          <Animated.Text style={styles.ghostText} numberOfLines={1}>
            {ghostLabel}
          </Animated.Text>
        </Animated.View>
      ) : null}
    </CalendarDragContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Draggable wrapper — wraps an event chip to make it long-press-draggable
// ---------------------------------------------------------------------------

/**
 * Wraps a child component to make it draggable via long-press.
 *
 * @param {Object} props
 * @param {Object} props.event - The calendar event
 * @param {React.ReactNode} props.children
 * @param {Function} props.onPress - Normal tap handler
 * @param {boolean} props.enabled
 */
export function DraggableEvent({ event, children, onPress, enabled = true }) {
  const { startDrag, updateDrag, endDrag, cancelDrag } = useCalendarDrag();
  const isDragActive = useRef(false);

  const longPress = Gesture.LongPress()
    .minDuration(LONG_PRESS_DURATION_MS)
    .enabled(enabled)
    .onStart((e) => {
      isDragActive.current = true;
      runOnJS(startDrag)(event, e.absoluteX, e.absoluteY);
    });

  const pan = Gesture.Pan()
    .enabled(enabled)
    .activateAfterLongPress(LONG_PRESS_DURATION_MS)
    .onUpdate((e) => {
      if (isDragActive.current) {
        runOnJS(updateDrag)(e.absoluteX, e.absoluteY);
      }
    })
    .onEnd((e) => {
      if (isDragActive.current) {
        isDragActive.current = false;
        runOnJS(endDrag)(e.absoluteX, e.absoluteY);
      }
    })
    .onFinalize(() => {
      if (isDragActive.current) {
        isDragActive.current = false;
        runOnJS(cancelDrag)();
      }
    });

  const tap = Gesture.Tap()
    .enabled(true)
    .onEnd(() => {
      if (!isDragActive.current) {
        runOnJS(onPress)?.(event);
      }
    });

  const composed = Gesture.Race(
    Gesture.Simultaneous(longPress, pan),
    tap,
  );

  return (
    <GestureDetector gesture={composed}>
      <Animated.View>{children}</Animated.View>
    </GestureDetector>
  );
}

// ---------------------------------------------------------------------------
// Drop target wrapper — registers a day cell as a drop target
// ---------------------------------------------------------------------------

/**
 * Wraps a day cell (or time column) to register it as a drop target.
 *
 * @param {Object} props
 * @param {string} props.dayKey - The YYYY-MM-DD key for this target
 * @param {React.ReactNode} props.children
 * @param {Object} props.style
 * @param {number} [props.totalHeight] - Total height of time grid (for minute calculation)
 * @param {number} [props.hourHeight] - Height per hour (for minute calculation)
 */
export function DropTarget({ dayKey, children, style, totalHeight, hourHeight, ...rest }) {
  const { registerDropTarget } = useCalendarDrag();
  const viewRef = useRef(null);

  const handleLayout = useCallback(() => {
    if (viewRef.current) {
      viewRef.current.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) {
          registerDropTarget(dayKey, { x, y, width, height, totalHeight, hourHeight });
        }
      });
    }
  }, [dayKey, registerDropTarget, totalHeight, hourHeight]);

  return (
    <View ref={viewRef} onLayout={handleLayout} style={style} {...rest}>
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  ghost: {
    position: 'absolute',
    width: GHOST_SIZE.width,
    height: GHOST_SIZE.height,
    borderRadius: 8,
    paddingHorizontal: 10,
    justifyContent: 'center',
    zIndex: 9999,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  ghostText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
});
