/**
 * Экран История — стек-версия (со стрелкой «Назад»).
 * Используется при прямой навигации router.push('/history').
 */

import HistoryList from '@/components/HistoryList';

export default function HistoryScreen() {
  return <HistoryList showBack />;
}
