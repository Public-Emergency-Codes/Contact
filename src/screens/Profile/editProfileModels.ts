export const BLOOD_TYPE_OPTIONS = ['Unknown', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export const WEIGHT_WHOLE_OPTIONS = Array.from({ length: 571 }, (_, i) => String(i + 30));
export const WEIGHT_DECIMAL_OPTIONS = Array.from({ length: 10 }, (_, i) => String(i));
export const HEIGHT_FEET_OPTIONS = Array.from({ length: 8 }, (_, i) => String(i + 1));
export const HEIGHT_INCH_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i));
export const HEIGHT_CM_OPTIONS = Array.from({ length: 211 }, (_, i) => String(i + 50));
export const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1));
export const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => String(i + 1));
export const YEAR_OPTIONS = Array.from({ length: 121 }, (_, i) => String(new Date().getFullYear() - i));

export type EditProfileForm = {
  firstName: string;
  lastName: string;
  photoUri: string;
  weight: string;
  height: string;
  dateOfBirth: string;
  bloodType: string;
  organDonor: boolean;
  medicalConditions: string;
  allergies: string;
  medications: string;
  address: string;
  psapNotes: string;
  isDeafOrMute: boolean;
  callInitSelfie: boolean;
  emergencyLanguage: string;
};

export const blankProfile: EditProfileForm = {
  firstName: '',
  lastName: '',
  photoUri: '',
  weight: '',
  height: '',
  dateOfBirth: '',
  bloodType: 'Unknown',
  organDonor: false,
  medicalConditions: '',
  allergies: '',
  medications: '',
  address: '',
  psapNotes: '',
  isDeafOrMute: false,
  callInitSelfie: false,
  emergencyLanguage: 'en',
};
