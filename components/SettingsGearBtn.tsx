import { TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/contexts/theme-context';

export default function SettingsGearBtn() {
  const { colors } = useAppTheme();
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => router.push('/settings' as never)}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    >
      <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}
