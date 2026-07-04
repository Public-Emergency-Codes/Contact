import type { OfflineLanguagePack } from './types';

import { AR_YI_ZH_PACKS } from './ar-yi-zh';
import { ES_FR_PT_PACKS } from './es-fr-pt';
import { IT_DE_PL_PACKS } from './it-de-pl';
import { KO_JA_HI_PACKS } from './ko-ja-hi';
import { RU_UK_HE_PACKS } from './ru-uk-he';

export type { OfflineLanguagePack } from './types';

const BASE_OFFLINE_LANGUAGE_PACKS: Record<string, OfflineLanguagePack> = {
  ...ES_FR_PT_PACKS,
  ...IT_DE_PL_PACKS,
  ...RU_UK_HE_PACKS,
  ...AR_YI_ZH_PACKS,
  ...KO_JA_HI_PACKS,
};

export const OFFLINE_LANGUAGE_PACKS: Record<string, OfflineLanguagePack> = {
  ...BASE_OFFLINE_LANGUAGE_PACKS,
};
