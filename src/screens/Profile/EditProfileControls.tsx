import React, { useEffect, useRef } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import AppText from '../../components/AppText';

const Text = AppText;

export function WheelSelector({ values, selectedValue, onChange, styles, width = 88 }: any) {
  const ITEM_HEIGHT = 44;
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    const idx = Math.max(values.indexOf(selectedValue), 0);
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: false });
    }, 50);
  }, [selectedValue, values]);

  return (
    <View style={[styles.wheelColumn, { width }]}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        scrollEventThrottle={16}
        bounces={false}
        contentContainerStyle={styles.wheelContent}
        onMomentumScrollEnd={(event) => {
          const idx = Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT);
          const bounded = Math.max(0, Math.min(values.length - 1, idx));
          onChange(values[bounded]);
        }}
      >
        {values.map((item: string) => (
          <View key={item} style={styles.wheelItem}>
            <Text style={[styles.wheelItemText, item === selectedValue && styles.wheelItemTextActive]}>{item}</Text>
          </View>
        ))}
      </ScrollView>
      <View pointerEvents="none" style={styles.wheelHighlight} />
    </View>
  );
}

export function Field({ label, value, onChangeText, placeholder, colors, styles, ...rest }: any) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.inputPlaceholder}
        style={[styles.input, rest.multiline ? styles.inputMultiline : null]}
        {...rest}
      />
    </View>
  );
}
