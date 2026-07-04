import { useCallback, useRef, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

export function useStickyDatePill() {
  const [stickyLabel, setStickyLabel] = useState<string | null>(null);
  const [stickyVisible, setStickyVisible] = useState(false);
  const dateSectionsRef = useRef<{ y: number; label: string }[]>([]);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onDividerLayout = useCallback((label: string, y: number) => {
    const arr = dateSectionsRef.current;
    const idx = arr.findIndex(s => s.label === label);
    if (idx >= 0) { arr[idx].y = y; }
    else { arr.push({ y, label }); }
    arr.sort((a, b) => a.y - b.y);
  }, []);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const scrollY = e.nativeEvent.contentOffset.y;
    const sections = dateSectionsRef.current;
    if (sections.length === 0) return;
    let current: string = sections[0].label;
    for (const section of sections) {
      if (section.y <= scrollY + 4) current = section.label;
    }
    setStickyLabel(current);
    setStickyVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setStickyVisible(false), 2000);
  }, []);

  return { stickyLabel, stickyVisible, onDividerLayout, handleScroll };
}
