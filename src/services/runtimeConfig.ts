export const EMERGENCY_TEST_NUMBER =
  (process.env.EXPO_PUBLIC_EMERGENCY_TEST_NUMBER || '2025550100').trim();

export const ENFORCE_NON_911_IN_DEV =
  String(process.env.EXPO_PUBLIC_ENFORCE_NON_911_IN_DEV || 'true').toLowerCase() !== 'false';
