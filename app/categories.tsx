/**
 * Экран управления категориями расходов — Этап 9, подшаг 3.
 * Раздел ТЗ: 6.5.
 *
 * - Список всех категорий. Встроенные — значок «встроенная», без удаления.
 * - Кнопка «+» → форма добавления пользовательской категории.
 * - Тап «✏» по пользовательской → форма редактирования.
 * - Тап «🗑» по пользовательской:
 *     • нет расходов → удаляет немедленно
 *     • есть расходов → показывает ошибку
 * - Кнопка «+ Добавить категорию» в форме расходов открывает этот экран.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

import { AppTheme } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';
import { categoryRepo, Category } from '@/db';
import { resolveIcon, USER_ICON_OPTIONS } from '@/utils/icons';

type FormState = {
  visible:  boolean;
  editId:   number | null;   // null = новая категория
  name:     string;
  icon:     string;
};

const DEFAULT_FORM: FormState = {
  visible: false,
  editId:  null,
  name:    '',
  icon:    USER_ICON_OPTIONS[0],
};

export default function CategoriesScreen() {
  const { t } = useTranslation();

  const th = useAppTheme();
  const { colors, radius, typography } = th;
  const s = useMemo(() => makeStyles(th), [th]);

  const [categories,  setCategories]  = useState<Category[]>([]);
  const [form,        setForm]        = useState<FormState>(DEFAULT_FORM);
  const [nameError,   setNameError]   = useState('');
  const [deleteError, setDeleteError] = useState<{ id: number; msg: string } | null>(null);
  const [saving,      setSaving]      = useState(false);

  // ── Загрузка ──────────────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    const cats = await categoryRepo.getAllCategories();
    setCategories(cats);
  }, []);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  // ── Открыть форму ─────────────────────────────────────────────────────────
  function openAdd() {
    setNameError('');
    setForm({ ...DEFAULT_FORM, visible: true });
  }

  function openEdit(cat: Category) {
    setNameError('');
    setForm({
      visible: true,
      editId:  cat.id,
      name:    cat.name,
      icon:    resolveIcon(cat.icon),   // нормализуем к Ionicons
    });
  }

  function closeForm() {
    setForm(DEFAULT_FORM);
    setNameError('');
  }

  // ── Сохранение ───────────────────────────────────────────────────────────
  async function handleSave() {
    const trimmed = form.name.trim();
    if (!trimmed) {
      setNameError(t('addReminder.errorName'));
      return;
    }
    setSaving(true);
    try {
      if (form.editId == null) {
        await categoryRepo.addCategory(trimmed, form.icon);
      } else {
        await categoryRepo.updateCategory(form.editId, { name: trimmed, icon: form.icon });
      }
      closeForm();
      await reload();
    } finally {
      setSaving(false);
    }
  }

  // ── Удаление ──────────────────────────────────────────────────────────────
  async function handleDelete(cat: Category) {
    setDeleteError(null);
    const result = await categoryRepo.deleteCategory(cat.id);
    if (result === 'deleted') {
      await reload();
    } else if (result === 'has_expenses') {
      setDeleteError({ id: cat.id, msg: t('categoriesScreen.errorHasExpenses') });
    }
    // 'builtin' — не должно доходить (кнопка скрыта)
  }

  // ── Рендер строки ─────────────────────────────────────────────────────────
  function renderItem({ item }: { item: Category }) {
    const iconName = resolveIcon(item.icon);
    const name     = item.key ? t(`categories.${item.key}` as never) : item.name;
    const isCustom = item.is_builtin === 0;

    return (
      <View style={s.row}>
        {/* Иконка */}
        <View style={s.iconWrap}>
          <Ionicons
            name={iconName as React.ComponentProps<typeof Ionicons>['name']}
            size={18}
            color={colors.textSecondary}
          />
        </View>

        {/* Название */}
        <Text style={s.catName} numberOfLines={1}>{name}</Text>

        {/* Бейдж для встроенных */}
        {!isCustom && (
          <Text style={s.builtinBadge}>{t('dbCheck.builtin')}</Text>
        )}

        {/* Ошибка под именем */}
        {deleteError?.id === item.id && (
          <Text style={s.inlineError} numberOfLines={2}>
            {deleteError.msg}
          </Text>
        )}

        {/* Кнопки для пользовательских */}
        {isCustom && (
          <View style={s.actions}>
            <TouchableOpacity
              style={s.actionBtn}
              onPress={() => openEdit(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="pencil-outline" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={s.actionBtn}
              onPress={() => handleDelete(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={16} color={colors.statusDue.text} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={s.screen}>
      {/* ── Шапка ──────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('categoriesScreen.title')}</Text>
        <TouchableOpacity
          style={s.addBtn}
          onPress={openAdd}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="add" size={26} color={colors.accent} />
        </TouchableOpacity>
      </View>

      {/* ── Список ─────────────────────────────────────────────────────── */}
      <FlatList
        data={categories}
        keyExtractor={item => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={s.listContent}
        ItemSeparatorComponent={() => <View style={s.separator} />}
      />

      {/* ── Модальная форма добавления / редактирования ─────────────────── */}
      <Modal
        visible={form.visible}
        transparent
        animationType="slide"
        onRequestClose={closeForm}
      >
        {/* KeyboardAvoidingView поднимает лист над клавиатурой:
            iOS 'padding', Android 'height'. Содержимое — в ScrollView,
            чтобы поле и кнопки оставались доступны при открытой клавиатуре. */}
        <KeyboardAvoidingView
          style={s.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity
            style={s.modalOverlay}
            activeOpacity={1}
            onPress={closeForm}
          />
          <View style={s.modalSheet}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={s.modalTitle}>
                {form.editId == null
                  ? t('categoriesScreen.addTitle')
                  : t('categoriesScreen.editTitle')}
              </Text>

              {/* Поле названия */}
              <Text style={s.fieldLabel}>{t('categoriesScreen.namePlaceholder')}</Text>
              <TextInput
                style={[s.input, !!nameError && s.inputError]}
                value={form.name}
                onChangeText={(v) => { setForm(f => ({ ...f, name: v })); setNameError(''); }}
                placeholder={t('categoriesScreen.namePlaceholder')}
                placeholderTextColor={colors.textWeak}
                autoFocus
              />
              {!!nameError && <Text style={s.errorText}>{nameError}</Text>}

              {/* Выбор иконки */}
              <Text style={[s.fieldLabel, { marginTop: 14 }]}>{t('categoriesScreen.iconLabel')}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                style={s.iconScroll}
                contentContainerStyle={s.iconScrollContent}
              >
                {USER_ICON_OPTIONS.map((iconName) => {
                  const active = form.icon === iconName;
                  return (
                    <TouchableOpacity
                      key={iconName}
                      style={[s.iconOption, active && s.iconOptionActive]}
                      onPress={() => setForm(f => ({ ...f, icon: iconName }))}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={iconName as React.ComponentProps<typeof Ionicons>['name']}
                        size={22}
                        color={active ? colors.accent : colors.textSecondary}
                      />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Кнопки */}
              <View style={s.modalBtns}>
                <TouchableOpacity style={s.cancelBtn} onPress={closeForm} activeOpacity={0.7}>
                  <Text style={s.cancelBtnText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.saveBtn}
                  onPress={handleSave}
                  activeOpacity={0.8}
                  disabled={saving}
                >
                  <Text style={s.saveBtnText}>
                    {saving ? '…' : t('categoriesScreen.saveBtn')}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
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

    // Шапка
    header: {
      flexDirection:   'row',
      alignItems:      'center',
      paddingTop:      56,
      paddingBottom:   12,
      paddingHorizontal: 16,
    },
    backBtn:     { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { flex: 1, textAlign: 'center', color: colors.textPrimary, ...typography.screenTitle },
    addBtn:      { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },

    // Список
    listContent: { paddingHorizontal: 16, paddingBottom: 40 },

    row: {
      flexDirection:   'row',
      alignItems:      'center',
      paddingVertical: 13,
      flexWrap:        'wrap',
    },
    separator: { height: 1, backgroundColor: colors.border, marginLeft: 48 },

    iconWrap: {
      width:          36,
      height:         36,
      borderRadius:   9,
      backgroundColor: colors.surface,
      justifyContent: 'center',
      alignItems:     'center',
      marginRight:    10,
    },
    catName: {
      flex:  1,
      color: colors.textPrimary,
      ...typography.cardText,
    },
    builtinBadge: {
      color:            colors.textMuted,
      ...typography.labelSmall,
      borderWidth:      1,
      borderColor:      colors.border,
      borderRadius:     4,
      paddingHorizontal: 5,
      paddingVertical:   1,
      marginLeft:       6,
    },
    inlineError: {
      color:     colors.statusDue.text,
      ...typography.labelSmall,
      width:     '100%',
      paddingLeft: 46,
      paddingTop:  4,
    },
    actions: {
      flexDirection: 'row',
      gap:           4,
      marginLeft:    8,
    },
    actionBtn: {
      width:           32,
      height:          32,
      borderRadius:    8,
      backgroundColor: colors.surface,
      justifyContent:  'center',
      alignItems:      'center',
    },

    // Модальный лист
    modalRoot: {
      flex: 1,
    },
    modalOverlay: {
      flex:            1,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    modalSheet: {
      backgroundColor:  colors.surface,
      borderTopLeftRadius:  20,
      borderTopRightRadius: 20,
      padding:          24,
      paddingBottom:    40,
      maxHeight:        '85%',
    },
    modalTitle: {
      color:        colors.textPrimary,
      ...typography.cardValue,
      marginBottom: 16,
      textAlign:    'center',
    },

    // Форма
    fieldLabel: {
      color:         colors.textSecondary,
      ...typography.labelSmall,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom:  6,
    },
    input: {
      backgroundColor:   colors.background,
      borderRadius:      radius.card,
      borderWidth:       1,
      borderColor:       colors.border,
      paddingHorizontal: 14,
      paddingVertical:   12,
      color:             colors.textPrimary,
      ...typography.cardText,
    },
    inputError: { borderColor: colors.statusDue.text },
    errorText:  {
      color:     colors.statusDue.text,
      ...typography.labelSmall,
      marginTop: 4,
    },

    // Скролл иконок
    iconScroll:        { marginHorizontal: -4 },
    iconScrollContent: { paddingHorizontal: 4, gap: 6, flexDirection: 'row' },
    iconOption: {
      width:           44,
      height:          44,
      borderRadius:    10,
      backgroundColor: colors.background,
      borderWidth:     1,
      borderColor:     colors.border,
      justifyContent:  'center',
      alignItems:      'center',
    },
    iconOptionActive: {
      borderColor:     colors.borderAccent,
      backgroundColor: colors.activeCard,
    },

    // Кнопки модала
    modalBtns: {
      flexDirection:  'row',
      gap:            10,
      marginTop:      20,
    },
    cancelBtn: {
      flex:            1,
      paddingVertical: 13,
      borderRadius:    radius.card,
      borderWidth:     1,
      borderColor:     colors.border,
      alignItems:      'center',
    },
    cancelBtnText: { color: colors.textSecondary, ...typography.cardTextMedium },
    saveBtn: {
      flex:            1,
      paddingVertical: 13,
      borderRadius:    radius.card,
      backgroundColor: colors.accent,
      alignItems:      'center',
    },
    saveBtnText: { color: '#fff', ...typography.cardTextMedium },
  });
}
