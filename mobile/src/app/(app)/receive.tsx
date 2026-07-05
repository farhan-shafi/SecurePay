/**
 * Receive money: your wallet as a QR code. Anyone can scan it from the app's
 * "New recipient" screen to pay you without typing your wallet id.
 */
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Card } from '@/components/Card';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Screen } from '@/components/Screen';
import { currencyMeta } from '@/lib/currencies';
import { useProfile, useWallet } from '@/lib/queries';
import { colors, font, spacing } from '@/theme/tokens';

// QR payload. Keep it a stable, versionless prefix so old QRs keep working.
export function walletQrValue(walletId: number) {
  return `securepay:wallet:${walletId}`;
}

export default function Receive() {
  const profile = useProfile();
  const wallet = useWallet();

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Receive money" />
      <Screen edgeTop={false}>
        <Text style={styles.lead}>
          Show this code to the sender — they can scan it from "New recipient"
          instead of typing your wallet id.
        </Text>
        {wallet.data ? (
          <Card style={styles.qrCard}>
            <View style={styles.qrBox}>
              <QRCode
                value={walletQrValue(wallet.data.id)}
                size={200}
                color={colors.textPrimary}
                backgroundColor="#FFFFFF"
              />
            </View>
            <Text style={styles.name}>
              {profile.data
                ? `${profile.data.first_name} ${profile.data.last_name}`
                : ' '}
            </Text>
            <Text style={styles.sub}>
              {currencyMeta(wallet.data.currency).flag} {wallet.data.currency} ·
              wallet #{wallet.data.id}
            </Text>
          </Card>
        ) : (
          <Card>
            <Text style={styles.sub}>Create a wallet first to receive money.</Text>
          </Card>
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  lead: {
    fontFamily: font.family.regular,
    fontSize: font.size.md,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  qrCard: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxxl },
  qrBox: { padding: spacing.lg, backgroundColor: '#FFFFFF', borderRadius: 16 },
  name: {
    fontFamily: font.family.bold,
    fontSize: font.size.xl,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  sub: {
    fontFamily: font.family.regular,
    fontSize: font.size.md,
    color: colors.textSecondary,
  },
});
