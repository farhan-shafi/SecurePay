/**
 * Bottom tab bar: Home · Payees · Statement. Clean white surface, brand indigo
 * as the active tint. (Pushed screens like Send/Settings sit above this in the
 * parent stack and hide the bar.)
 */
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { colors, font, shadow } from '@/theme/tokens';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontFamily: font.family.medium,
          fontSize: font.size.xs,
        },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 0,
          height: 84,
          paddingTop: 8,
          ...shadow.floating,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="beneficiaries"
        options={{
          title: 'Payees',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="statement"
        options={{
          title: 'Statement',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
