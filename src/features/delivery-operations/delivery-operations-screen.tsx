import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppSubpageHeader } from '@/components/navigation/app-subpage-header';
import type {
  DeliveryPolicyMutation,
  DeliveryPolicySummary,
  DeliveryPolicyVariant,
} from '@/core/api';
import { useWahbTheme } from '@/design/theme';
import { useWahbTypography } from '@/design/typography';
import { useAuth } from '@/features/auth/auth-provider';

function hasPermission(permissions: string[], action: 'read' | 'write') {
  return (
    permissions.includes('content:*') ||
    permissions.includes(`content:${action}`) ||
    permissions.includes('*:*')
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

type PolicyDraft = DeliveryPolicyMutation & { id?: string };

function draftFor(policy?: DeliveryPolicySummary): PolicyDraft {
  if (policy) {
    return {
      id: policy.id,
      name: policy.name,
      media_kind: policy.media_kind === 'audio' ? 'audio' : 'video',
      primary_mode:
        policy.primary_mode === 'audio' || policy.primary_mode === 'hls'
          ? policy.primary_mode
          : 'progressive',
      rollout_state:
        policy.rollout_state === 'active' || policy.rollout_state === 'paused'
          ? policy.rollout_state
          : 'shadow',
      allow_hls: policy.allow_hls,
      generate_progressive_fallback: policy.generate_progressive_fallback,
      hls_segment_duration_sec: 6,
      hls_segment_format: 'cmaf',
      hls_min_variants: 2,
      variants: [...policy.variants].sort((a, b) => a.priority - b.priority),
    };
  }
  return {
    name: '',
    media_kind: 'video',
    primary_mode: 'hls',
    rollout_state: 'shadow',
    allow_hls: true,
    generate_progressive_fallback: true,
    hls_segment_duration_sec: 6,
    hls_segment_format: 'cmaf',
    hls_min_variants: 2,
    short_form_delivery: true,
    allow_native_audio: true,
    allow_mp4_fallback: true,
    allow_passthrough: true,
    allow_remux: true,
    generate_audio_alternate: true,
    preserve_video: true,
    active: false,
    max_delivery_height: 720,
    max_delivery_bitrate_kbps: 2500,
    cache_profile: 'immutable-media',
    variants: [
      {
        rendition_type: 'progressive',
        quality_tier: 'data_saver',
        priority: 10,
        required: true,
        enabled: true,
      },
      {
        rendition_type: 'hls',
        quality_tier: 'standard',
        priority: 20,
        required: true,
        enabled: true,
      },
      {
        rendition_type: 'hls',
        quality_tier: 'high',
        priority: 30,
        required: false,
        enabled: true,
      },
      {
        rendition_type: 'audio',
        quality_tier: 'standard',
        priority: 40,
        required: true,
        enabled: true,
      },
    ],
  };
}

function confirm(
  title: string,
  message: string,
  confirmLabel: string,
  cancelLabel: string,
) {
  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: 'destructive',
        onPress: () => resolve(true),
      },
    ]);
  });
}

/** CMS-backed mobile drill-down. Queue and object-store authority never enter
 * the app; every mutation is re-authorized and fenced by CMS. */
export function DeliveryOperationsScreen() {
  const { t } = useTranslation();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { theme } = useWahbTheme();
  const { font } = useWahbTypography();
  const [contentId, setContentId] = useState('');
  const [policyDraft, setPolicyDraft] = useState<PolicyDraft | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [diagnostics, setDiagnostics] = useState<Record<
    string,
    unknown
  > | null>(null);
  const roles = useQuery({
    queryKey: ['iam-roles', auth.subject?.id],
    enabled: Boolean(auth.subject),
    queryFn: () => auth.clients.iam.getRoles(),
  });
  const canRead =
    roles.data?.is_admin ||
    hasPermission(roles.data?.permissions ?? [], 'read');
  const canWrite =
    roles.data?.is_admin ||
    hasPermission(roles.data?.permissions ?? [], 'write');
  const policies = useQuery({
    queryKey: ['delivery-policies', auth.subject?.id],
    enabled: Boolean(canRead),
    queryFn: () => auth.clients.cms.getDeliveryPolicies(),
  });
  const repairs = useQuery({
    queryKey: ['delivery-repairs', auth.subject?.id],
    enabled: Boolean(canRead),
    queryFn: () => auth.clients.cms.getDeliveryRepairHistory(),
    refetchInterval: 10_000,
  });
  const inspect = useMutation({
    mutationFn: async () => {
      const id = contentId.trim();
      const [nextPreview, nextDiagnostics] = await Promise.all([
        auth.clients.cms.previewDeliveryRepair(id),
        auth.clients.cms.getDeliveryDiagnostics(id),
      ]);
      return { nextPreview, nextDiagnostics };
    },
    onSuccess: ({ nextPreview, nextDiagnostics }) => {
      setPreview(nextPreview);
      setDiagnostics(nextDiagnostics);
    },
  });
  const requestRepair = useMutation({
    mutationFn: async () => {
      const repairPreview = record(preview?.repair_preview);
      const digest = repairPreview?.preview_digest;
      if (typeof digest !== 'string') throw new Error('preview_unavailable');
      if (
        !(await confirm(
          t('deliveryOps.confirmRepair'),
          t('deliveryOps.confirmRepairCopy'),
          t('deliveryOps.requestRepair'),
          t('deliveryOps.cancel'),
        ))
      )
        return null;
      return auth.clients.cms.requestDeliveryRepair(contentId.trim(), digest);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['delivery-repairs'] });
    },
  });
  const setPolicyActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      auth.clients.cms.setDeliveryPolicyActive(id, active),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['delivery-policies'] }),
  });
  const savePolicy = useMutation({
    mutationFn: async (draft: PolicyDraft) => {
      const { id, ...input } = draft;
      const variants = input.variants.map((variant, index) => ({
        ...variant,
        priority: (index + 1) * 10,
      }));
      const mutation = { ...input, name: input.name.trim(), variants };
      if (!mutation.name) throw new Error('policy_name_required');
      if (
        mutation.primary_mode === 'hls' &&
        variants.filter(
          (variant) => variant.enabled && variant.rendition_type === 'hls',
        ).length < 2
      ) {
        throw new Error('policy_hls_variants_required');
      }
      return id
        ? auth.clients.cms.updateDeliveryPolicy(id, mutation)
        : auth.clients.cms.createDeliveryPolicy(mutation);
    },
    onSuccess: () => {
      setPolicyDraft(null);
      void queryClient.invalidateQueries({ queryKey: ['delivery-policies'] });
    },
  });
  const rollback = useMutation({
    mutationFn: async (generationId: string) => {
      if (
        !(await confirm(
          t('deliveryOps.confirmRollback'),
          `${t('deliveryOps.targetGeneration')}: ${generationId}`,
          t('deliveryOps.rollback'),
          t('deliveryOps.cancel'),
        ))
      )
        return;
      await auth.clients.cms.rollbackDeliveryGeneration(generationId);
    },
    onSuccess: () => {
      setPreview(null);
      setDiagnostics(null);
      void queryClient.invalidateQueries({ queryKey: ['delivery-repairs'] });
    },
  });

  const accessCopy = !auth.subject
    ? t('deliveryOps.signInRequired')
    : roles.isLoading
      ? t('deliveryOps.checkingAccess')
      : !canRead
        ? t('deliveryOps.denied')
        : null;
  const generationRows = Array.isArray(diagnostics?.generations)
    ? diagnostics.generations.map(record).filter(Boolean)
    : [];

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <AppSubpageHeader fallback="/settings" title={t('deliveryOps.title')} />
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        {accessCopy ? (
          <Text
            selectable
            style={[
              styles.copy,
              { color: theme.mutedForeground, fontFamily: font('body') },
            ]}
          >
            {accessCopy}
          </Text>
        ) : (
          <>
            <Section title={t('deliveryOps.policies')}>
              {canWrite && !policyDraft ? (
                <Action
                  label={t('deliveryOps.createPolicy')}
                  onPress={() => setPolicyDraft(draftFor())}
                />
              ) : null}
              {(policies.data?.data ?? []).map((policy) => (
                <View
                  key={policy.id}
                  style={[styles.row, { borderColor: theme.border }]}
                >
                  <View style={styles.rowCopy}>
                    <Text
                      selectable
                      style={[
                        styles.label,
                        { color: theme.foreground, fontFamily: font('bold') },
                      ]}
                    >
                      {policy.name}
                    </Text>
                    <Text
                      selectable
                      style={[
                        styles.meta,
                        {
                          color: theme.mutedForeground,
                          fontFamily: font('mono'),
                        },
                      ]}
                    >
                      {policy.media_kind} · {policy.primary_mode} ·{' '}
                      {policy.rollout_state}
                    </Text>
                  </View>
                  <View style={styles.rowActions}>
                    {canWrite ? (
                      <Action
                        compact
                        label={
                          policy.tenant_id
                            ? t('deliveryOps.edit')
                            : t('deliveryOps.copyPolicy')
                        }
                        onPress={() => {
                          const draft = draftFor(policy);
                          if (!policy.tenant_id) delete draft.id;
                          setPolicyDraft(draft);
                        }}
                      />
                    ) : null}
                    <Switch
                      accessibilityLabel={policy.name}
                      disabled={
                        !canWrite ||
                        !policy.tenant_id ||
                        setPolicyActive.isPending
                      }
                      value={policy.active}
                      onValueChange={(active) =>
                        setPolicyActive.mutate({ id: policy.id, active })
                      }
                      trackColor={{ false: theme.muted, true: theme.accent }}
                    />
                  </View>
                </View>
              ))}
              {policyDraft ? (
                <PolicyEditor
                  draft={policyDraft}
                  disabled={savePolicy.isPending}
                  onCancel={() => setPolicyDraft(null)}
                  onChange={setPolicyDraft}
                  onSave={() => savePolicy.mutate(policyDraft)}
                />
              ) : null}
              {savePolicy.isError ? (
                <Text
                  selectable
                  style={[
                    styles.error,
                    { color: theme.accent, fontFamily: font('body') },
                  ]}
                >
                  {t('deliveryOps.policyInvalid')}
                </Text>
              ) : null}
            </Section>

            <Section title={t('deliveryOps.inspect')}>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(value) => {
                  setContentId(value);
                  setPreview(null);
                  setDiagnostics(null);
                }}
                placeholder={t('deliveryOps.contentId')}
                placeholderTextColor={theme.mutedForeground}
                style={[
                  styles.input,
                  {
                    borderColor: theme.border,
                    color: theme.foreground,
                    fontFamily: font('mono'),
                  },
                ]}
                value={contentId}
              />
              <Action
                disabled={contentId.trim().length !== 36 || inspect.isPending}
                label={
                  inspect.isPending
                    ? t('deliveryOps.loading')
                    : t('deliveryOps.preview')
                }
                onPress={() => inspect.mutate()}
              />
              {inspect.isError ? (
                <Text
                  selectable
                  style={[
                    styles.error,
                    { color: theme.accent, fontFamily: font('body') },
                  ]}
                >
                  {t('deliveryOps.inspectFailed')}
                </Text>
              ) : null}
              {preview ? (
                <View
                  style={[
                    styles.proof,
                    { borderColor: theme.border, backgroundColor: theme.card },
                  ]}
                >
                  <Proof
                    label={t('deliveryOps.route')}
                    value={String(preview.route ?? '—')}
                  />
                  <Proof
                    label={t('deliveryOps.repairAvailable')}
                    value={
                      record(preview.repair_preview)
                        ? t('deliveryOps.yes')
                        : t('deliveryOps.no')
                    }
                  />
                  {canWrite && record(preview.repair_preview) ? (
                    <Action
                      disabled={requestRepair.isPending}
                      label={t('deliveryOps.requestRepair')}
                      onPress={() => requestRepair.mutate()}
                    />
                  ) : null}
                </View>
              ) : null}
              {generationRows.map((generation) => (
                <View
                  key={String(generation?.id)}
                  style={[styles.row, { borderColor: theme.border }]}
                >
                  <View style={styles.rowCopy}>
                    <Text
                      selectable
                      style={[
                        styles.label,
                        { color: theme.foreground, fontFamily: font('bold') },
                      ]}
                    >
                      #{String(generation?.generation_number ?? '—')} ·{' '}
                      {String(generation?.state ?? '—')}
                    </Text>
                    <Text
                      selectable
                      style={[
                        styles.meta,
                        {
                          color: theme.mutedForeground,
                          fontFamily: font('mono'),
                        },
                      ]}
                    >
                      {String(generation?.id ?? '')}
                    </Text>
                  </View>
                  {canWrite && generation?.state === 'superseded' ? (
                    <Action
                      compact
                      disabled={rollback.isPending}
                      label={t('deliveryOps.rollback')}
                      onPress={() => rollback.mutate(String(generation?.id))}
                    />
                  ) : null}
                </View>
              ))}
            </Section>

            <Section title={t('deliveryOps.recentRepairs')}>
              {(repairs.data?.repairs ?? []).map((value, index) => {
                const repair = record(value);
                return (
                  <View
                    key={String(repair?.id ?? index)}
                    style={[styles.row, { borderColor: theme.border }]}
                  >
                    <View style={styles.rowCopy}>
                      <Text
                        selectable
                        style={[
                          styles.label,
                          { color: theme.foreground, fontFamily: font('bold') },
                        ]}
                      >
                        {String(
                          repair?.state ??
                            repair?.status ??
                            t('deliveryOps.unknown'),
                        )}
                      </Text>
                      <Text
                        selectable
                        style={[
                          styles.meta,
                          {
                            color: theme.mutedForeground,
                            fontFamily: font('mono'),
                          },
                        ]}
                      >
                        {String(repair?.id ?? '')}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </Section>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function PolicyEditor({
  draft,
  disabled,
  onCancel,
  onChange,
  onSave,
}: {
  draft: PolicyDraft;
  disabled: boolean;
  onCancel: () => void;
  onChange: (draft: PolicyDraft) => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const { theme } = useWahbTheme();
  const { font } = useWahbTypography();
  const replaceVariant = (index: number, value: DeliveryPolicyVariant) =>
    onChange({
      ...draft,
      variants: draft.variants.map((variant, candidate) =>
        candidate === index ? value : variant,
      ),
    });
  const moveVariant = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draft.variants.length) return;
    const variants = [...draft.variants];
    [variants[index], variants[target]] = [variants[target]!, variants[index]!];
    onChange({ ...draft, variants });
  };
  return (
    <View
      style={[
        styles.editor,
        { borderColor: theme.border, backgroundColor: theme.card },
      ]}
    >
      <TextInput
        value={draft.name}
        onChangeText={(name) => onChange({ ...draft, name })}
        placeholder={t('deliveryOps.policyName')}
        placeholderTextColor={theme.mutedForeground}
        style={[
          styles.input,
          {
            borderColor: theme.border,
            color: theme.foreground,
            fontFamily: font('body'),
          },
        ]}
      />
      <View style={styles.choiceRow}>
        {(['audio', 'video'] as const).map((mediaKind) => (
          <Choice
            key={mediaKind}
            active={draft.media_kind === mediaKind}
            label={mediaKind}
            onPress={() =>
              onChange({
                ...draft,
                media_kind: mediaKind,
                primary_mode:
                  mediaKind === 'audio'
                    ? 'audio'
                    : draft.primary_mode === 'audio'
                      ? 'progressive'
                      : draft.primary_mode,
                allow_hls: mediaKind === 'video' && draft.allow_hls,
                variants:
                  mediaKind === 'audio'
                    ? [
                        {
                          rendition_type: 'audio',
                          quality_tier: 'data_saver',
                          priority: 10,
                          required: true,
                          enabled: true,
                        },
                        {
                          rendition_type: 'audio',
                          quality_tier: 'standard',
                          priority: 20,
                          required: true,
                          enabled: true,
                        },
                        {
                          rendition_type: 'audio',
                          quality_tier: 'high',
                          priority: 30,
                          required: false,
                          enabled: true,
                        },
                      ]
                    : draft.media_kind === 'audio'
                      ? draftFor().variants
                      : draft.variants,
              })
            }
          />
        ))}
      </View>
      <View style={styles.choiceRow}>
        {(['audio', 'progressive', 'hls'] as const)
          .filter((mode) => draft.media_kind === 'video' || mode === 'audio')
          .map((mode) => (
            <Choice
              key={mode}
              active={draft.primary_mode === mode}
              label={mode}
              onPress={() =>
                onChange({
                  ...draft,
                  primary_mode: mode,
                  allow_hls: mode === 'hls' ? true : draft.allow_hls,
                })
              }
            />
          ))}
      </View>
      <View style={styles.choiceRow}>
        {(['shadow', 'active', 'paused'] as const).map((state) => (
          <Choice
            key={state}
            active={draft.rollout_state === state}
            label={state}
            onPress={() => onChange({ ...draft, rollout_state: state })}
          />
        ))}
      </View>
      {draft.variants.map((variant, index) => (
        <View
          key={`${variant.rendition_type}:${variant.quality_tier}:${index}`}
          style={[styles.variant, { borderColor: theme.border }]}
        >
          <Text
            selectable
            style={[
              styles.meta,
              { color: theme.foreground, fontFamily: font('mono') },
            ]}
          >
            {index + 1}. {variant.rendition_type} · {variant.quality_tier}
          </Text>
          <View style={styles.choiceRow}>
            {(['audio', 'progressive', 'hls'] as const).map((type) => (
              <Choice
                key={type}
                active={variant.rendition_type === type}
                label={type}
                onPress={() =>
                  replaceVariant(index, { ...variant, rendition_type: type })
                }
              />
            ))}
          </View>
          <View style={styles.choiceRow}>
            {(['data_saver', 'standard', 'high'] as const).map((tier) => (
              <Choice
                key={tier}
                active={variant.quality_tier === tier}
                label={tier}
                onPress={() =>
                  replaceVariant(index, { ...variant, quality_tier: tier })
                }
              />
            ))}
          </View>
          <View style={styles.rowActions}>
            <Choice
              label="↑"
              active={false}
              onPress={() => moveVariant(index, -1)}
            />
            <Choice
              label="↓"
              active={false}
              onPress={() => moveVariant(index, 1)}
            />
            <Choice
              label={
                variant.required
                  ? t('deliveryOps.required')
                  : t('deliveryOps.optional')
              }
              active={variant.required}
              onPress={() =>
                replaceVariant(index, {
                  ...variant,
                  required: !variant.required,
                })
              }
            />
            <Choice
              label={
                variant.enabled
                  ? t('deliveryOps.enabled')
                  : t('deliveryOps.disabled')
              }
              active={variant.enabled}
              onPress={() =>
                replaceVariant(index, { ...variant, enabled: !variant.enabled })
              }
            />
            <Choice
              label={t('deliveryOps.remove')}
              active={false}
              onPress={() =>
                onChange({
                  ...draft,
                  variants: draft.variants.filter(
                    (_, candidate) => candidate !== index,
                  ),
                })
              }
            />
          </View>
        </View>
      ))}
      <Action
        compact
        label={t('deliveryOps.addVariant')}
        onPress={() =>
          onChange({
            ...draft,
            variants: [
              ...draft.variants,
              {
                rendition_type:
                  draft.media_kind === 'audio' ? 'audio' : 'progressive',
                quality_tier: 'standard',
                priority: (draft.variants.length + 1) * 10,
                required: false,
                enabled: true,
              },
            ],
          })
        }
      />
      <View style={styles.rowActions}>
        <Action
          disabled={disabled}
          label={t('deliveryOps.save')}
          onPress={onSave}
        />
        <Action
          disabled={disabled}
          label={t('deliveryOps.cancel')}
          onPress={onCancel}
        />
      </View>
    </View>
  );
}

function Choice({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  const { theme } = useWahbTheme();
  const { font } = useWahbTypography();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.choice,
        {
          borderColor: active ? theme.accent : theme.border,
          backgroundColor: active ? theme.muted : 'transparent',
        },
      ]}
    >
      <Text
        style={[
          styles.meta,
          {
            color: active ? theme.accent : theme.foreground,
            fontFamily: font('bold'),
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Section({ children, title }: { children: ReactNode; title: string }) {
  const { theme } = useWahbTheme();
  const { font } = useWahbTypography();
  return (
    <View style={styles.section}>
      <Text
        style={[
          styles.heading,
          { color: theme.foreground, fontFamily: font('editorial') },
        ]}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function Proof({ label, value }: { label: string; value: string }) {
  const { theme } = useWahbTheme();
  const { font } = useWahbTypography();
  return (
    <View style={styles.proofRow}>
      <Text
        style={[
          styles.meta,
          { color: theme.mutedForeground, fontFamily: font('body') },
        ]}
      >
        {label}
      </Text>
      <Text
        selectable
        style={[
          styles.label,
          { color: theme.foreground, fontFamily: font('mono') },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function Action({
  compact = false,
  disabled,
  label,
  onPress,
}: {
  compact?: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  const { theme } = useWahbTheme();
  const { font } = useWahbTypography();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        compact && styles.compactAction,
        { borderColor: theme.accent },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.actionText,
          { color: theme.accent, fontFamily: font('bold') },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { gap: 24, padding: 20, paddingBottom: 40 },
  section: { gap: 10 },
  heading: { fontSize: 24, lineHeight: 30 },
  copy: { fontSize: 14, lineHeight: 21 },
  row: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
  },
  rowCopy: { flex: 1, gap: 4 },
  rowActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  label: { fontSize: 14, lineHeight: 19 },
  meta: { fontSize: 11, lineHeight: 16 },
  input: {
    borderWidth: 1,
    borderRadius: 4,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  proof: { borderWidth: 1, borderRadius: 4, gap: 10, padding: 12 },
  editor: { borderWidth: 1, borderRadius: 4, gap: 12, padding: 12 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  variant: { borderTopWidth: StyleSheet.hairlineWidth, gap: 8, paddingTop: 10 },
  proofRow: { gap: 3 },
  action: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  compactAction: { paddingHorizontal: 10, paddingVertical: 7 },
  actionText: { fontSize: 12, letterSpacing: 0.3 },
  error: { fontSize: 13, lineHeight: 19 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
});
