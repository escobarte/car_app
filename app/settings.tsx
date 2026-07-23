/**
 * Экран Настройки — Этап 9.
 * Разделы ТЗ: 4.6, 9.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

import { AppTheme } from '@/constants/theme';
import { useAppTheme, useThemeCtx } from '@/contexts/theme-context';
import { settingsRepo, carRepo } from '@/db';
import { scheduleReminderNotifications } from '@/notifications/engine';
import { exportDatabase, importDatabase } from '@/db/backup';

// ─── Вспомогательные компоненты (получают colors через props) ───────────────

function SectionHeader({ label, colors }: { label: string; colors: AppTheme['colors'] }) {
  return (
    <Text style={[sectionHeaderStyle, { color: colors.textWeak }]}>
      {label}
    </Text>
  );
}
const sectionHeaderStyle: object = {
  fontSize: 12, fontWeight: '400', letterSpacing: 1,
  textTransform: 'uppercase', marginTop: 24, marginBottom: 6, marginLeft: 4,
};

function NavRow({
  label, value, onPress, isLast = false, colors, radius,
}: {
  label: string; value?: string; onPress?: () => void;
  isLast?: boolean; colors: AppTheme['colors']; radius: AppTheme['radius'];
}) {
  return (
    <TouchableOpacity
      style={[
        rowBase,
        { borderBottomWidth: isLast ? 0 : 1, borderBottomColor: colors.border },
      ]}
      activeOpacity={onPress ? 0.6 : 1}
      onPress={onPress}
    >
      <Text style={[rowLabel, { color: colors.textPrimary }]}>{label}</Text>
      <View style={rowRight}>
        {!!value && <Text style={[rowValue, { color: colors.textSecondary }]}>{value}</Text>}
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

function SwitchRow({
  label, value, onChange, isLast = false, colors,
}: {
  label: string; value: boolean; onChange: (v: boolean) => void;
  isLast?: boolean; colors: AppTheme['colors'];
}) {
  return (
    <View style={[rowBase, { borderBottomWidth: isLast ? 0 : 1, borderBottomColor: colors.border }]}>
      <Text style={[rowLabel, { color: colors.textPrimary }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.accent }}
        thumbColor={colors.textPrimary}
        ios_backgroundColor={colors.border}
      />
    </View>
  );
}

const rowBase: object  = { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16 };
const rowRight: object = { flexDirection: 'row', alignItems: 'center', gap: 6 };
const rowLabel: object = { fontSize: 15, fontWeight: '400', flex: 1 };
const rowValue: object = { fontSize: 15, fontWeight: '400' };

// ─── Главный компонент ────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const { t } = useTranslation();
  const th = useAppTheme();
  const { isDark, setDark } = useThemeCtx();
  const { colors, radius, typography } = th;
  const s = useMemo(() => makeStyles(th), [th]);

  const [carName,      setCarName]      = useState('');
  const [odometer,     setOdometer]     = useState(0);
  const [currency,     setCurrency]     = useState('MDL');
  const [language,     setLanguage]     = useState<'ru' | 'en'>('ru');
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [backupState,  setBackupState]  = useState<'idle' | 'working' | 'done' | 'error'>('idle');

  // Редактирование названия машины
  const [showNameModal, setShowNameModal] = useState(false);
  const [nameInput,     setNameInput]     = useState('');
  const [nameError,     setNameError]     = useState('');

  // Редактирование пробега
  const [showOdoModal, setShowOdoModal] = useState(false);
  const [odoInput,     setOdoInput]     = useState('');
  const [odoError,     setOdoError]     = useState('');

  const loadData = useCallback(async () => {
    const [car, settings] = await Promise.all([carRepo.getCar(), settingsRepo.getSettings()]);
    if (car) { setCarName(car.name); setOdometer(car.current_odometer); setCurrency(car.currency); }
    if (settings) {
      setLanguage(settings.language);
      setNotifEnabled(settings.notifications_enabled === 1);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  function openNameModal() {
    setNameInput(carName);
    setNameError('');
    setShowNameModal(true);
  }

  async function handleNameSave() {
    const trimmed = nameInput.trim();
    if (!trimmed) { setNameError(t('settings.carNameError')); return; }
    try {
      await carRepo.updateCar({ name: trimmed });
      setCarName(trimmed);
      setShowNameModal(false);
    } catch (e) {
      console.error('[Settings] updateCar name', e);
    }
  }

  function openOdoModal() {
    setOdoInput('');
    setOdoError('');
    setShowOdoModal(true);
  }

  async function handleOdoSave() {
    const raw = odoInput.trim();
    if (!raw) { setShowOdoModal(false); return; }
    const num = parseInt(raw, 10);
    if (isNaN(num) || num < odometer) {
      setOdoError(t('common.errorOdometer'));
      return;
    }
    try {
      await carRepo.updateCar({ current_odometer: num });
      setOdometer(num);
      setShowOdoModal(false);
    } catch (e) {
      console.error('[Settings] updateCar odometer', e);
    }
  }

  async function handleNotifToggle(value: boolean) {
    setNotifEnabled(value);
    await settingsRepo.updateSettings({ notifications_enabled: value ? 1 : 0 });
    scheduleReminderNotifications().catch(() => {});
  }

  // ── Экспорт ──────────────────────────────────────────────────────────────
  async function handleExport() {
    setBackupState('working');
    try {
      const savedFileName = await exportDatabase();
      if (savedFileName) {
        Alert.alert(
          t('backup.exportSuccess'),
          t('backup.exportSavedSAF', { name: savedFileName }),
        );
      }
      setBackupState('idle');
    } catch (e) {
      Alert.alert(t('backup.exportError'), String(e));
      setBackupState('error');
      setTimeout(() => setBackupState('idle'), 2000);
    }
  }

  // ── Импорт ───────────────────────────────────────────────────────────────
  async function handleImport() {
    Alert.alert(
      t('backup.importConfirmTitle'),
      t('backup.importConfirmMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text:  t('backup.importConfirmOk'),
          style: 'destructive',
          onPress: async () => {
            setBackupState('working');
            const result = await importDatabase();
            if (result.ok) {
              const { counts: c } = result;
              Alert.alert(
                t('backup.importSuccess'),
                `${c.fuel} ${t('backup.fuel')} · ${c.expense} ${t('backup.expense')} · ${c.service} ${t('backup.service')}`,
              );
              await loadData();
              setBackupState('idle');
            } else if (result.code === 'cancelled') {
              setBackupState('idle');
            } else if (result.code === 'invalid_file') {
              Alert.alert(
                t('backup.importError'),
                t('backup.importErrorInvalidFile') + (result.detail ? `\n\n${result.detail}` : ''),
              );
              setBackupState('error');
              setTimeout(() => setBackupState('idle'), 2000);
            } else {
              Alert.alert(
                t('backup.importError'),
                t('backup.importErrorRestoreFailed') + (result.detail ? `\n\n${result.detail}` : ''),
              );
              setBackupState('error');
              setTimeout(() => setBackupState('idle'), 2000);
            }
          },
        },
      ],
    );
  }

  const langLabel = language === 'ru' ? 'RU' : 'EN';

  // TEMP: удалить после проверки push ────────────────────────────────────────
  async function handleTestNotification() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const N = require('expo-notifications') as typeof import('expo-notifications');

      const { status } = await N.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('debug.notifDenied'));
        return;
      }

      if (Platform.OS === 'android') {
        await N.setNotificationChannelAsync('car-app-debug', {
          name:       t('debug.sectionTitle'),
          importance: N.AndroidImportance.MAX,
        });
      }

      await N.scheduleNotificationAsync({
        content: { title: t('debug.testNotifTitle'), body: t('debug.testNotifBody') },
        trigger: {
          type:      N.SchedulableTriggerInputTypes.TIME_INTERVAL,
          channelId: 'car-app-debug',
          seconds:   30,
          repeats:   false,
        },
      });

      Alert.alert(t('debug.notifScheduled'));
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    }
  }
  // ── конец TEMP ──────────────────────────────────────────────────────────────

  return (
    <View style={s.screen}>
      {/* ── Шапка ──────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          activeOpacity={0.7}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('settings.title')}</Text>
        <View style={s.headerSpacer} />
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── МАШИНА ─────────────────────────────────────────────────────── */}
        <SectionHeader label={t('settings.sectionCar')} colors={colors} />
        <View style={s.card}>
          <NavRow label={t('settings.carName')}    value={carName}   onPress={openNameModal}   isLast={false} colors={colors} radius={radius} />
          <NavRow label={t('settings.odometer')}   value={`${odometer} ${t('common.km')}`}      isLast={false} colors={colors} radius={radius} onPress={openOdoModal} />
          <NavRow label={t('settings.categories')} onPress={() => router.push('/categories' as never)} isLast colors={colors} radius={radius} />
        </View>

        {/* ── ВАЛЮТА ─────────────────────────────────────────────────────── */}
        <SectionHeader label={t('settings.sectionCurrency')} colors={colors} />
        <View style={s.card}>
          <NavRow label={t('settings.currency')} value={currency} onPress={() => router.push('/select-currency' as never)} isLast colors={colors} radius={radius} />
        </View>

        {/* ── ЯЗЫК ───────────────────────────────────────────────────────── */}
        <SectionHeader label={t('settings.sectionLanguage')} colors={colors} />
        <View style={s.card}>
          <NavRow label={t('settings.language')} value={langLabel} onPress={() => router.push('/select-language' as never)} isLast colors={colors} radius={radius} />
        </View>

        {/* ── ВНЕШНИЙ ВИД ────────────────────────────────────────────────── */}
        <SectionHeader label={t('settings.sectionAppearance')} colors={colors} />
        <View style={s.card}>
          <SwitchRow label={t('settings.darkTheme')} value={isDark} onChange={setDark} isLast colors={colors} />
        </View>

        {/* ── УВЕДОМЛЕНИЯ ────────────────────────────────────────────────── */}
        <SectionHeader label={t('settings.sectionNotifications')} colors={colors} />
        <View style={s.card}>
          <SwitchRow label={t('settings.notifications')} value={notifEnabled} onChange={handleNotifToggle} isLast colors={colors} />
        </View>

        {/* ── РЕЗЕРВНАЯ КОПИЯ ────────────────────────────────────────────── */}
        <SectionHeader label={t('settings.sectionBackup')} colors={colors} />
        <View style={s.card}>
          <NavRow label={t('settings.exportData')} onPress={handleExport}
            value={backupState === 'working' ? '…' : undefined}
            isLast={false} colors={colors} radius={radius} />
          <NavRow label={t('settings.importData')} onPress={handleImport} isLast colors={colors} radius={radius} />
        </View>

        {/* TEMP: удалить после проверки push ─────────────────────────────── */}
        <SectionHeader label={t('debug.sectionTitle')} colors={{ ...colors, textWeak: colors.statusDue.text }} />
        <View style={s.card}>
          <TouchableOpacity style={[s.debugBtn, { backgroundColor: colors.statusDue.background }]} activeOpacity={0.7} onPress={handleTestNotification}>
            <Text style={[s.debugBtnText, { color: colors.statusDue.text }]}>{t('debug.testNotifBtn')}</Text>
          </TouchableOpacity>
        </View>
        {/* ── конец TEMP ─────────────────────────────────────────────────── */}

        <View style={s.bottomPad} />
      </ScrollView>

      {/* ── Модалка редактирования названия машины ──────────────────────── */}
      <Modal
        visible={showNameModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowNameModal(false)}
        statusBarTranslucent
        navigationBarTranslucent
      >
        <KeyboardAvoidingView
          style={s.odoOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={s.odoSheet}>
            <Text style={s.odoTitle}>{t('settings.editCarNameTitle')}</Text>
            <TextInput
              style={[s.odoInput, nameError ? s.odoInputError : undefined]}
              value={nameInput}
              onChangeText={(v) => { setNameInput(v); if (nameError) setNameError(''); }}
              placeholder={carName}
              placeholderTextColor={colors.textWeak}
              maxLength={40}
              autoFocus
              selectionColor={colors.accent}
            />
            {!!nameError && <Text style={s.odoError}>{nameError}</Text>}
            <View style={s.odoActions}>
              <TouchableOpacity
                style={[s.odoBtn, { borderColor: colors.border }]}
                onPress={() => setShowNameModal(false)}
                activeOpacity={0.8}
              >
                <Text style={[s.odoBtnText, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.odoBtn, { borderColor: colors.borderAccent, backgroundColor: colors.activeCard }]}
                onPress={handleNameSave}
                activeOpacity={0.8}
              >
                <Text style={[s.odoBtnText, { color: colors.accent }]}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Модалка редактирования пробега ─────────────────────────────── */}
      <Modal
        visible={showOdoModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowOdoModal(false)}
        statusBarTranslucent
        navigationBarTranslucent
      >
        <KeyboardAvoidingView
          style={s.odoOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={s.odoSheet}>
            <Text style={s.odoTitle}>{t('settings.editOdometerTitle')}</Text>
            <TextInput
              style={[s.odoInput, odoError ? s.odoInputError : undefined]}
              value={odoInput}
              onChangeText={(v) => { setOdoInput(v); if (odoError) setOdoError(''); }}
              keyboardType="number-pad"
              placeholder={String(odometer)}
              placeholderTextColor={colors.textWeak}
              autoFocus
              selectionColor={colors.accent}
            />
            {!!odoError && <Text style={s.odoError}>{odoError}</Text>}
            <View style={s.odoActions}>
              <TouchableOpacity
                style={[s.odoBtn, { borderColor: colors.border }]}
                onPress={() => setShowOdoModal(false)}
                activeOpacity={0.8}
              >
                <Text style={[s.odoBtnText, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.odoBtn, { borderColor: colors.borderAccent, backgroundColor: colors.activeCard }]}
                onPress={handleOdoSave}
                activeOpacity={0.8}
              >
                <Text style={[s.odoBtnText, { color: colors.accent }]}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Стили ──────────────────────────────────────────────────────────────────

function makeStyles(th: AppTheme) {
  const { colors, radius, typography } = th;
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingTop: 56, paddingBottom: 12, paddingHorizontal: 16,
      backgroundColor: colors.background,
    },
    backBtn:      { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
    headerTitle:  { flex: 1, textAlign: 'center', color: colors.textPrimary, ...typography.screenTitle },
    headerSpacer: { width: 36 },
    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 8 },
    card: { backgroundColor: colors.surface, borderRadius: radius.card, overflow: 'hidden' },
    bottomPad: { height: 40 },
    // TEMP: удалить после проверки push
    debugBtn:     { paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center' },
    debugBtnText: { ...typography.cardText, fontWeight: '500' as const },

    // ── Модалка пробега ───────────────────────────────────────────────────────
    odoOverlay: {
      flex:            1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent:  'flex-end',
    },
    odoSheet: {
      backgroundColor:      colors.surface,
      borderTopLeftRadius:  20,
      borderTopRightRadius: 20,
      padding:              24,
      paddingBottom:        32,
    },
    odoTitle: {
      color:         colors.textSecondary,
      ...typography.labelSmall,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom:  10,
    },
    odoInput: {
      backgroundColor:   colors.background,
      borderRadius:      radius.card,
      borderWidth:       1,
      borderColor:       colors.border,
      paddingHorizontal: 16,
      paddingVertical:   14,
      color:             colors.textPrimary,
      ...typography.cardText,
      marginBottom:      4,
    },
    odoInputError: { borderColor: colors.statusDue.text },
    odoError: {
      color:        colors.statusDue.text,
      ...typography.labelSmall,
      marginBottom: 12,
      marginLeft:   4,
    },
    odoActions: {
      flexDirection:  'row',
      gap:            10,
      marginTop:      16,
    },
    odoBtn: {
      flex:            1,
      paddingVertical: 13,
      borderRadius:    radius.card,
      borderWidth:     1,
      alignItems:      'center',
    },
    odoBtnText: { ...typography.cardTextMedium },
  });
}
