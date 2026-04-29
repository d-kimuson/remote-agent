import type { FC, PropsWithChildren, ReactNode } from 'react';

import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export const Screen: FC<
  PropsWithChildren<{ readonly title: string; readonly action?: ReactNode }>
> = ({ action, children, title }) => (
  <View style={styles.screen}>
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      {action}
    </View>
    {children}
  </View>
);

export const ScreenScroll: FC<PropsWithChildren> = ({ children }) => (
  <ScrollView contentContainerStyle={styles.scrollContent}>{children}</ScrollView>
);

export const Panel: FC<PropsWithChildren> = ({ children }) => (
  <View style={styles.panel}>{children}</View>
);

export const BodyText: FC<PropsWithChildren<{ readonly muted?: boolean }>> = ({
  children,
  muted = false,
}) => <Text style={muted ? styles.mutedText : styles.bodyText}>{children}</Text>;

export const FieldLabel: FC<PropsWithChildren> = ({ children }) => (
  <Text style={styles.fieldLabel}>{children}</Text>
);

export const TextField: FC<{
  readonly autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  readonly multiline?: boolean;
  readonly onChangeText: (value: string) => void;
  readonly placeholder?: string;
  readonly secureTextEntry?: boolean;
  readonly value: string;
}> = ({
  autoCapitalize = 'none',
  multiline = false,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  value,
}) => (
  <TextInput
    autoCapitalize={autoCapitalize}
    multiline={multiline}
    onChangeText={onChangeText}
    placeholder={placeholder}
    secureTextEntry={secureTextEntry}
    style={[styles.textField, multiline ? styles.textArea : null]}
    value={value}
  />
);

export const Button: FC<{
  readonly children: string;
  readonly disabled?: boolean;
  readonly onPress: () => void;
  readonly variant?: 'primary' | 'secondary' | 'ghost';
}> = ({ children, disabled = false, onPress, variant = 'primary' }) => (
  <Pressable
    accessibilityRole="button"
    disabled={disabled}
    onPress={onPress}
    style={[
      styles.button,
      variant === 'secondary' ? styles.secondaryButton : null,
      variant === 'ghost' ? styles.ghostButton : null,
      disabled ? styles.disabledButton : null,
    ]}
  >
    <Text
      style={[
        styles.buttonText,
        variant === 'secondary' ? styles.secondaryButtonText : null,
        variant === 'ghost' ? styles.ghostButtonText : null,
      ]}
    >
      {children}
    </Text>
  </Pressable>
);

export const RowButton: FC<{
  readonly detail?: string | null;
  readonly disabled?: boolean;
  readonly label: string;
  readonly onPress: () => void;
  readonly selected?: boolean;
}> = ({ detail = null, disabled = false, label, onPress, selected = false }) => (
  <Pressable
    accessibilityRole="button"
    disabled={disabled}
    onPress={onPress}
    style={[
      styles.rowButton,
      selected ? styles.selectedRowButton : null,
      disabled ? styles.disabledButton : null,
    ]}
  >
    <View style={styles.rowButtonContent}>
      <Text style={styles.rowButtonLabel}>{label}</Text>
      {detail !== null && detail.length > 0 ? (
        <Text style={styles.rowButtonDetail}>{detail}</Text>
      ) : null}
    </View>
    <Text style={selected ? styles.selectedMark : styles.unselectedMark}>
      {selected ? 'Selected' : 'Select'}
    </Text>
  </Pressable>
);

export const LoadingState: FC<{ readonly label: string }> = ({ label }) => (
  <View style={styles.centerState}>
    <ActivityIndicator />
    <BodyText muted>{label}</BodyText>
  </View>
);

export const ErrorState: FC<{ readonly message: string; readonly onRetry?: () => void }> = ({
  message,
  onRetry,
}) => (
  <Panel>
    <BodyText>{message}</BodyText>
    {onRetry !== undefined ? (
      <Button onPress={onRetry} variant="secondary">
        Retry
      </Button>
    ) : null}
  </Panel>
);

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingTop: 56,
  },
  header: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    flex: 1,
    color: '#0f172a',
    fontSize: 24,
    fontWeight: '700',
  },
  scrollContent: {
    gap: 12,
    padding: 16,
    paddingBottom: 32,
  },
  panel: {
    gap: 12,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: '#ffffff',
    padding: 14,
  },
  bodyText: {
    color: '#0f172a',
    fontSize: 15,
    lineHeight: 21,
  },
  mutedText: {
    color: '#64748b',
    fontSize: 14,
    lineHeight: 20,
  },
  fieldLabel: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
  },
  textField: {
    minHeight: 44,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: '#ffffff',
    color: '#0f172a',
    paddingHorizontal: 12,
    fontSize: 15,
  },
  textArea: {
    minHeight: 96,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  button: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#2563eb',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryButton: {
    borderColor: '#cbd5e1',
    borderWidth: 1,
    backgroundColor: '#ffffff',
  },
  ghostButton: {
    backgroundColor: 'transparent',
    paddingHorizontal: 8,
  },
  disabledButton: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  rowButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectedRowButton: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  rowButtonContent: {
    flex: 1,
    gap: 2,
  },
  rowButtonLabel: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '700',
  },
  rowButtonDetail: {
    color: '#64748b',
    fontSize: 12,
  },
  selectedMark: {
    color: '#2563eb',
    fontSize: 12,
    fontWeight: '700',
  },
  unselectedMark: {
    color: '#64748b',
    fontSize: 12,
  },
  secondaryButtonText: {
    color: '#0f172a',
  },
  ghostButtonText: {
    color: '#2563eb',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 24,
  },
});
