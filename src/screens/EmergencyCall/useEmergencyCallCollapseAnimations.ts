import { useRef } from 'react';
import { Animated } from 'react-native';

export interface CollapseAnimsResult {
  videoCollapseAnim: Animated.Value;
  locationCollapseAnim: Animated.Value;
  videoBubbleRef: React.MutableRefObject<any>;
  locationThumbRef: React.MutableRefObject<any>;
  relocationThumbRefs: React.MutableRefObject<{ [key: number]: any }>;
  relocationCollapseAnims: React.MutableRefObject<{ [key: number]: Animated.Value }>;
  identityCollapseAnims: React.MutableRefObject<{ [key: number]: Animated.Value }>;
  identityThumbRefs: React.MutableRefObject<{ [key: number]: any }>;
  chatImageCollapseAnims: React.MutableRefObject<{ [key: number]: Animated.Value }>;
  chatImageThumbRefs: React.MutableRefObject<{ [key: number]: any }>;
  expandedAnims: Set<Animated.Value>;
  collapseTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  suppressCollapse: React.MutableRefObject<boolean>;
  lastScrollY: React.MutableRefObject<number>;
  videoPeeked: React.MutableRefObject<boolean>;
  locationPeeked: React.MutableRefObject<boolean>;
  relocationPeeked: React.MutableRefObject<{ [key: number]: boolean }>;
  getRelocationAnim: (idx: number) => Animated.Value;
  getIdentityAnim: (idx: number) => Animated.Value;
  getChatImageAnim: (idx: number) => Animated.Value;
  getAllAnims: () => Animated.Value[];
  collapseAll: () => void;
  collapseOneByOne: () => void;
  expandOne: (anim: Animated.Value, viewRef?: React.RefObject<any>) => void;
  peekAnimation: (anim: Animated.Value) => void;
  handleScrollEvent: (event: any, scrollViewRef?: React.RefObject<any>) => void;
  handleTouchStart: (event: any, lastTouchY?: React.MutableRefObject<number>) => void;
  handleTouchMove: (event: any, lastTouchY?: React.MutableRefObject<number>) => void;
}

export const useEmergencyCallCollapseAnimations = (scrollViewRef: React.RefObject<any>): CollapseAnimsResult => {
  const videoCollapseAnim = useRef(new Animated.Value(0)).current;
  const locationCollapseAnim = useRef(new Animated.Value(1)).current;
  const relocationCollapseAnims = useRef<{ [key: number]: Animated.Value }>({});
  const relocationThumbRefs = useRef<{ [key: number]: any }>({});
  const identityCollapseAnims = useRef<{ [key: number]: Animated.Value }>({});
  const identityThumbRefs = useRef<{ [key: number]: any }>({});
  const chatImageCollapseAnims = useRef<{ [key: number]: Animated.Value }>({});
  const chatImageThumbRefs = useRef<{ [key: number]: any }>({});
  const videoBubbleRef = useRef<any>(null);
  const locationThumbRef = useRef<any>(null);
  const expandedAnims = useRef(new Set<Animated.Value>([locationCollapseAnim])).current;
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressCollapse = useRef(false);
  const lastScrollY = useRef(0);
  const videoPeeked = useRef(false);
  const locationPeeked = useRef(false);
  const relocationPeeked = useRef<{ [key: number]: boolean }>({});
  const lastTouchY = useRef(0);

  const getRelocationAnim = (idx: number) => {
    if (!relocationCollapseAnims.current[idx]) {
      relocationCollapseAnims.current[idx] = new Animated.Value(0);
    }
    return relocationCollapseAnims.current[idx];
  };

  const getIdentityAnim = (idx: number) => {
    if (!identityCollapseAnims.current[idx]) {
      identityCollapseAnims.current[idx] = new Animated.Value(0);
    }
    return identityCollapseAnims.current[idx];
  };

  const getChatImageAnim = (idx: number) => {
    if (!chatImageCollapseAnims.current[idx]) {
      chatImageCollapseAnims.current[idx] = new Animated.Value(0);
    }
    return chatImageCollapseAnims.current[idx];
  };

  const getAllAnims = (): Animated.Value[] => [
    videoCollapseAnim,
    locationCollapseAnim,
    ...Object.values(relocationCollapseAnims.current),
  ];

  const collapseAll = () => {
    expandedAnims.clear();
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    Animated.parallel(
      getAllAnims().map(a => Animated.timing(a, { toValue: 0, duration: 250, useNativeDriver: false }))
    ).start();
  };

  const collapseOneByOne = () => {
    if (collapseTimer.current) return;
    const toCollapse = Array.from(expandedAnims);
    if (toCollapse.length === 0) return;
    const collapseAt = (i: number) => {
      if (i >= toCollapse.length) { collapseTimer.current = null; return; }
      const anim = toCollapse[i];
      expandedAnims.delete(anim);
      Animated.timing(anim, { toValue: 0, duration: 250, useNativeDriver: false }).start();
      if (i + 1 < toCollapse.length) {
        collapseTimer.current = setTimeout(() => collapseAt(i + 1), 300);
      } else {
        collapseTimer.current = setTimeout(() => { collapseTimer.current = null; }, 300);
      }
    };
    collapseAt(0);
  };

  const expandOne = (anim: Animated.Value, viewRef?: React.RefObject<any>) => {
    if (collapseTimer.current) { clearTimeout(collapseTimer.current); collapseTimer.current = null; }
    expandedAnims.add(anim);
    Animated.timing(anim, { toValue: 1, duration: 300, useNativeDriver: false }).start(() => {
      if (viewRef?.current && scrollViewRef.current) {
        suppressCollapse.current = true;
        setTimeout(() => {
          viewRef.current?.measureLayout?.(
            scrollViewRef.current,
            (_x: number, y: number, _w: number, _h: number) => {
              scrollViewRef.current?.scrollTo({ y: Math.max(0, y - 40), animated: true });
              setTimeout(() => { suppressCollapse.current = false; }, 500);
            },
            () => { suppressCollapse.current = false; }
          );
        }, 50);
      }
    });
  };

  const peekAnimation = (anim: Animated.Value) => {
    Animated.sequence([
      Animated.delay(200),
      Animated.timing(anim, { toValue: 0.35, duration: 600, useNativeDriver: false }),
      Animated.delay(400),
      Animated.timing(anim, { toValue: 0, duration: 500, useNativeDriver: false }),
    ]).start();
  };

  const handleScrollEvent = (event: any, _scrollViewRef?: React.RefObject<any>) => {
    const y = event.nativeEvent.contentOffset.y;
    const diff = y - lastScrollY.current;
    if (Math.abs(diff) > 8 && !suppressCollapse.current) collapseOneByOne();
    lastScrollY.current = y;
  };

  const handleTouchStart = (event: any, touchYRef = lastTouchY) => {
    touchYRef.current = event.nativeEvent.pageY;
  };

  const handleTouchMove = (event: any, touchYRef = lastTouchY) => {
    const diff = event.nativeEvent.pageY - touchYRef.current;
    if (Math.abs(diff) > 15 && expandedAnims.size > 0 && !suppressCollapse.current) {
      collapseOneByOne();
      touchYRef.current = event.nativeEvent.pageY;
    }
  };

  return {
    videoCollapseAnim, locationCollapseAnim, relocationCollapseAnims, identityCollapseAnims,
    chatImageCollapseAnims,
    videoBubbleRef, locationThumbRef, relocationThumbRefs,
    identityThumbRefs, chatImageThumbRefs, expandedAnims, collapseTimer, suppressCollapse, lastScrollY,
    videoPeeked, locationPeeked, relocationPeeked,
    getRelocationAnim, getIdentityAnim, getChatImageAnim, getAllAnims,
    collapseAll, collapseOneByOne, expandOne, peekAnimation,
    handleScrollEvent, handleTouchStart, handleTouchMove,
  };
};
