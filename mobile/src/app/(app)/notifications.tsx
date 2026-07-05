/**
 * Notification feed — the same rows the notification worker records when it
 * emails "you sent / you received" alerts, now visible in the app.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Card } from '@/components/Card';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useNotifications } from '@/lib/queries';
import { formatDateTime } from '@/lib/format';
import { colors, font, spacing } from '@/theme/tokens';

export default function Notifications() {
  const router = useRouter();
  const q = useNotifications();
  const items = q.data ?? [];

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Notifications" />
      {q.isLoading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.huge }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => String(n.id)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={q.isRefetching}
              onRefresh={() => q.refetch()}
              tintColor={colors.brand}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={36} color={colors.textMuted} />
              <Text style={styles.emptyText}>
                Nothing yet — make a transfer and the alerts will show up here.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const received = item.message.toLowerCase().includes('received');
            return (
              <Card
                style={styles.row}
                onPress={
                  item.transaction_id
                    ? () => router.push(`/(app)/transaction/${item.transaction_id}`)
                    : undefined
                }
              >
                <View
                  style={[
                    styles.icon,
                    { backgroundColor: received ? colors.successSoft : colors.surfaceAlt },
                  ]}
                >
                  <Ionicons
                    name={received ? 'arrow-down-outline' : 'arrow-up-outline'}
                    size={18}
                    color={received ? colors.success : colors.brand}
                  />
                </View>
                <View style={styles.body}>
                  <Text style={styles.message}>{item.message}</Text>
                  <Text style={styles.meta}>
                    {formatDateTime(item.created_at)}
                    {item.transaction_id ? `  ·  TXN-${item.transaction_id}` : ''}
                  </Text>
                </View>
                {item.transaction_id ? (
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                ) : null}
              </Card>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.huge },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  message: {
    fontFamily: font.family.medium,
    fontSize: font.size.md,
    color: colors.textPrimary,
  },
  meta: {
    fontFamily: font.family.regular,
    fontSize: font.size.sm,
    color: colors.textMuted,
  },
  empty: { alignItems: 'center', gap: spacing.md, marginTop: spacing.huge },
  emptyText: {
    fontFamily: font.family.regular,
    fontSize: font.size.md,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
});
