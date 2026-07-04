import makeCheckInSettingsStyles from './checkInSettingsStyles';

export type CheckInSettingsStyles = ReturnType<typeof makeCheckInSettingsStyles>;
export type TimeUnit = 'min' | 'hr';
export type Meridiem = 'AM' | 'PM';
export type TranslateFn = (value: string) => string;
