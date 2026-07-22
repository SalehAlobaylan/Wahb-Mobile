import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { captureException } from '@/core/diagnostics/diagnostics';
import i18n from '@/core/i18n';
import { colors, fontFamilies, radii, spacing } from '@/design/tokens';

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
};

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  override state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo): void {
    captureException('app_error_boundary', error);
  }

  private retry = () => {
    this.setState({ hasError: false });
  };

  override render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <SafeAreaView style={styles.safeArea}>
        <View accessibilityLiveRegion="assertive" style={styles.content}>
          <Text style={styles.eyebrow}>WAHB</Text>
          <Text accessibilityRole="header" style={styles.title}>
            {i18n.t('errors.title')}
          </Text>
          <Text style={styles.description}>{i18n.t('errors.copy')}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={i18n.t('errors.retry')}
            onPress={this.retry}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.buttonText}>{i18n.t('errors.retry')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  eyebrow: {
    color: colors.pressRed,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 12,
    letterSpacing: 1.5,
  },
  title: {
    color: colors.ink,
    fontFamily: fontFamilies.editorial,
    fontSize: 34,
    lineHeight: 41,
    marginTop: spacing.sm,
  },
  description: {
    color: colors.inkMuted,
    fontFamily: fontFamilies.body,
    fontSize: 16,
    lineHeight: 24,
    marginTop: spacing.md,
  },
  button: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.pressRed,
    borderColor: colors.ink,
    borderRadius: radii.compact,
    borderWidth: 1,
    marginTop: spacing.lg,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  buttonPressed: {
    opacity: 0.84,
  },
  buttonText: {
    color: colors.inkInverse,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 15,
  },
});
