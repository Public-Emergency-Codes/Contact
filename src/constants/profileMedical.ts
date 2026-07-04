export const PROFILE_MEDICAL_INFO_KEY = '@profile_medical_info';
export const PROFILE_PHOTO_KEY = '@profile_photo_uri';
export const CALL_INIT_SELFIE_ENABLED_KEY = '@call_init_selfie_enabled';
export const EMERGENCY_INFO_LANGUAGE_KEY = '@emergency_info_language';
export const LOCAL_PROFILE_KEY = '@local_profile_v1';

// Single on-device profile (no user accounts). The 'guest' scope is kept so any
// data saved previously (when userId was always null) is still found.
const PROFILE_SCOPE = 'guest';

export function getProfileMedicalInfoStorageKey() {
	return `${PROFILE_MEDICAL_INFO_KEY}:${PROFILE_SCOPE}`;
}

export function getProfilePhotoStorageKey() {
	return `${PROFILE_PHOTO_KEY}:${PROFILE_SCOPE}`;
}
