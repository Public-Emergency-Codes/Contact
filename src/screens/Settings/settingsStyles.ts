import { StyleSheet } from 'react-native';
import type { AppColors } from '../../utils/themeColors';

export default function makeSettingsStyles(colors: AppColors, topInset: number) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flexGrow: 1,
      paddingBottom: 40,
      backgroundColor: colors.background,
    },
    header: {
      backgroundColor: colors.surface,
      alignItems: 'center',
      paddingTop: topInset + 32,
      paddingBottom: 32,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      position: 'absolute',
      top: topInset + 12,
      left: 16,
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10,
    },
    identityTapArea: {
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 8,
      borderRadius: 14,
    },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.accent,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
      overflow: 'hidden',
    },
    avatarText: {
      fontSize: 32,
      fontWeight: 'bold',
      color: '#FFF',
    },
    avatarPhoto: {
      width: 80,
      height: 80,
      borderRadius: 40,
      marginBottom: 16,
    },
    name: {
      fontSize: 24,
      fontWeight: 'bold',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    email: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    emailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 2,
      gap: 8,
    },

    badge: {
      backgroundColor: '#FEF3C7',
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
      marginTop: 8,
    },
    badgeText: {
      fontSize: 12,
      color: '#92400E',
      fontWeight: '600',
    },
    section: {
      backgroundColor: colors.surface,
      marginTop: 12,
      paddingHorizontal: 24,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: 16,
      marginBottom: 8,
    },
    menuItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceAlt,
    },
    menuItemSingle: {
      borderBottomWidth: 0,
      paddingVertical: 12,
    },
    menuItemTextWrap: {
      flex: 1,
      marginRight: 8,
    },
    menuItemText: {
      fontSize: 16,
      color: colors.textPrimary,
    },
    menuItemDesc: {
      marginTop: 2,
      fontSize: 13,
      color: colors.textSecondary,
    },
    menuItemArrow: {
      fontSize: 24,
      color: colors.textMuted,
    },
    featureToggleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceAlt,
    },
    featureToggleSingle: {
      borderBottomWidth: 0,
      paddingVertical: 12,
    },
    featureToggleTextWrap: {
      flex: 1,
      marginRight: 8,
    },
    featureToggleTitle: {
      fontSize: 16,
      color: colors.textPrimary,
      marginBottom: 2,
    },
    featureToggleSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    footerActions: {
      marginTop: 12,
      paddingHorizontal: 24,
      alignItems: 'center',
    },
    supportPillRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 10,
    },
    supportPill: {
      paddingHorizontal: 4,
      paddingTop: 2,
      paddingBottom: 2,
    },
    supportPillText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textMuted,
      textDecorationLine: 'underline',
      textDecorationColor: colors.textMuted,
    },
    logoutButton: {
      marginTop: 18,
      backgroundColor: '#DC2626',
      borderRadius: 999,
      paddingVertical: 14,
      paddingHorizontal: 28,
      alignItems: 'center',
    },
    logoutButtonText: {
      color: '#FFF',
      fontSize: 16,
      fontWeight: '600',
    },
    version: {
      textAlign: 'center',
      marginTop: 16,
      fontSize: 12,
      color: colors.textMuted,
    },
  });
}
